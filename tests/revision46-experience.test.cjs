const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('REV46 coordinator-only analytics and presentation pages exist',()=>{
  const html=read('admin.html'), access=read('js/access.js'), dash=read('js/dashboard.js');
  for(const id of ['menu-analitik','menu-presentasi','page-analitik','page-presentasi']) assert.match(html,new RegExp(id));
  assert.match(access,/analitik/); assert.match(access,/presentasi/); assert.match(access,/koordinator/);
  const rev=read('js/rev46-experience.js'); assert.match(rev,/loadAnalytics/); assert.match(rev,/loadPresentation/);
});

test('REV46 assessment mobile, keyboard, paste, lazy loading and caching are wired',()=>{
  const html=read('admin.html'), js=read('js/assessments.js');
  assert.match(html,/assessmentPasteExcel/); assert.match(html,/assessmentMobileBar/); assert.match(html,/assessmentPeriodPrev/); assert.match(html,/assessmentPeriodNext/);
  assert.match(js,/inputmode="decimal"/); assert.match(js,/enterkeyhint="next"/);
  assert.match(js,/IntersectionObserver/); assert.match(js,/requestIdleCallback/);
  assert.match(js,/sessionStorage/); assert.match(js,/openPasteDialog/); assert.match(js,/parseClipboard/);
  assert.match(js,/event\.key === 'Enter'/); assert.match(js,/preventDefault\(\)/);
});

test('REV46 PWA/update center, device detection and footer are present',()=>{
  const pwa=read('js/pwa.js'), sw=read('sw.js'), css=read('css/rev46-experience.css');
  assert.match(pwa,/const BUILD = 'loader49'/); assert.match(sw,/const VERSION = 'loader49'/);
  assert.match(pwa,/pwa-status-chip/); assert.match(pwa,/Periksa update/); assert.match(pwa,/Preview mobile/); assert.match(pwa,/Preview desktop/);
  assert.match(pwa,/aplikasi dibuat oleh/); assert.match(pwa,/Geys Amadda Dien/);
  assert.match(css,/safe-area-inset-top/); assert.match(css,/safe-area-inset-bottom/); assert.match(css,/orientation:\s*landscape/);
  assert.match(css,/data-gm-theme="dark"/);
});

test('REV46 report direct print and consistent filenames are wired',()=>{
  const html=read('admin.html'), rc=read('js/report-cards.js'), up=read('js/gm-upgrade-20260928.js');
  assert.match(html,/reportDirectPrint/); assert.match(rc,/autoPrint/); assert.match(rc,/GMFileName\?\.report/);
  assert.match(up,/Target Tahsin Tahfidz/); assert.match(up,/Backup Gemar Mengaji/);
});

test('REV46 aggregate analytics never renders student identity columns',()=>{
  const js=read('js/rev46-experience.js');
  assert.match(js,/Tidak ada nama siswa/);
  assert.match(js,/Tercapai/); assert.match(js,/Belum tercapai/); assert.match(js,/Kehadiran/);
  assert.doesNotMatch(js,/<th>Nama siswa<\/th>/i);
  assert.doesNotMatch(js,/<th>NISN?<\/th>/i);
});

test('REV46 build includes new experience assets',()=>{
  const b=read('scripts/build-static.cjs'), sw=read('sw.js');
  assert.match(b,/rev46-experience\.js/); assert.match(b,/rev46-experience\.css/); assert.match(b,/loader49/);
  assert.match(sw,/rev46-experience\.js/); assert.match(sw,/rev46-experience\.css/);
});
