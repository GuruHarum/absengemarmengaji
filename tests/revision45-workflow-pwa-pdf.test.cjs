const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('REV45 periodic assessment workflow adds problem mode, local draft, favorite filter, export and retry without DB migration', () => {
  const js = read('js/assessments.js');
  const html = read('admin.html');
  assert.match(js, /problemOnly/);
  assert.match(js, /gm_assessment_drafts_v45/);
  assert.match(js, /gm_assessment_favorite_filter_v45/);
  assert.match(js, /persistDrafts/);
  assert.match(js, /confirmLeave/);
  assert.match(js, /Simpan sekarang/);
  assert.match(js, /xlsx\.full\.min\.js/);
  assert.match(js, /lastFailedSave/);
  assert.match(js, /Coba Lagi/);
  for (const id of ['assessmentProblemOnly','assessmentFavoriteSave','assessmentFavoriteUse','assessmentExport','assessmentRetrySave','assessmentSaveSummary','assessmentDraftState']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.equal(fs.existsSync(path.join(root, 'supabase/20260929-27-capaian-tahsin-jilid-juz27.sql')), false);
});

test('REV45 dashboard guards navigation away from unsaved periodic assessment', () => {
  const js = read('js/dashboard.js');
  assert.match(js, /PeriodicAssessments\?\.hasUnsavedChanges/);
  assert.match(js, /PeriodicAssessments\.confirmLeave/);
});

test('REV45 PDF optimization preserves REV43 visual render constants and adds progress/retry', () => {
  const pdf = read('js/report-pdf.js');
  const cards = read('js/report-cards.js');
  const html = read('admin.html');
  assert.match(pdf, /scale: draft \? 5\.05 : 4\.75/);
  assert.match(pdf, /normalWeight: '500'/);
  assert.match(pdf, /c\.lineWidth = \.38/);
  assert.match(pdf, /toDataURL\('image\/png'\)/);
  assert.match(pdf, /addImage\([^\n]*'PNG', 0, 0, 210, 297\)/);
  assert.match(pdf, /const workCanvas = document\.createElement\('canvas'\)/);
  assert.match(cards, /reportRetryDownload/);
  assert.match(cards, /perkiraan sisa/);
  assert.match(cards, /Data rapor yang sudah dimuat tetap tersedia/);
  assert.match(html, /id="reportPdfProgress"/);
});

test('REV45 PWA is loader45 and includes iPhone/iPad install support and safe-area layout', () => {
  const pwa = read('js/pwa.js');
  const sw = read('sw.js');
  const css = read('css/pwa.css');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.match(pwa, /const BUILD = 'loader49'/);
  assert.match(sw, /const VERSION = 'loader49'/);
  assert.match(pwa, /Pasang di iPhone\/iPad/);
  assert.match(pwa, /Tambahkan ke Layar Utama/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.display_override.includes('standalone'));
  for (const rel of ['index.html','admin.html','login.html','maintenance.html']) {
    const html = read(rel);
    assert.match(html, /viewport-fit=cover/);
    assert.match(html, /apple-touch-icon/);
    assert.match(html, /apple-mobile-web-app-capable/);
  }
});

test('REV44 remains canceled: Tahsin target/progress engine stays on REV43 type model', () => {
  const core = read('js/report-core.js');
  assert.match(core, /const types = \['BUKU', 'JILID', "AL-QUR'AN", 'GHARIB', 'TAJWID', 'FINISHING', 'SYAHADAH', 'TAKHASSUS'\]/);
  assert.doesNotMatch(core, /const types = \[[^\]]*'JUZ 27'/);
});

test('REV45 retains REV43 partial student transfer features', () => {
  const groups = read('js/learning-groups.js');
  const sql = read('supabase/20260929-26-transfer-murid-kelompok.sql');
  assert.match(groups, /data-transfer-students/);
  assert.match(groups, />Transfer Murid</);
  assert.match(groups, /gm_transfer_group_students/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.gm_transfer_group_students/i);
  assert.doesNotMatch(sql, /DELETE FROM public\.students/i);
});
