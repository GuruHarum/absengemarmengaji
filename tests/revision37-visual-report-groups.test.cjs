const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('REV37 keeps the collapsed sidebar logo square and loads the final override last', () => {
  const html = read('admin.html');
  const css = read('css/rev37-visual-fixes.css');
  assert.match(html, /rev37-visual-fixes\.css\?v=20260929-rev37/);
  assert.match(css, /#adminSchoolLogo[\s\S]*width:\s*46px\s*!important[\s\S]*height:\s*46px\s*!important/);
  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /flex:\s*0\s+0\s+46px/);
});

test('REV37 group empty state has an icon and full-width readable copy', () => {
  const js = read('js/learning-groups.js');
  const css = read('css/rev37-visual-fixes.css');
  assert.match(js, /Belum ada kelompok aktif/);
  assert.match(js, /gm-empty-icon/);
  assert.match(css, /grid-column:\s*1\s*\/\s*-1/);
  assert.match(css, /word-break:\s*normal/);
});

test('REV37 PDF follows the school print layout more closely', () => {
  const pdf = read('js/report-pdf.js');
  assert.match(pdf, /SEKOLAH DASAR ISLAM TERPADU \(SDIT\)/);
  assert.match(pdf, /CAPAIAN KOMPETENSI :/);
  assert.match(pdf, /ReportCore\.description\(naturalName\(student\.name\)/);
  assert.match(pdf, /ReportCore\.note\(naturalName\(student\.name\)/);
  assert.match(pdf, /c\.lineWidth = \.34/);
  assert.match(pdf, /ORANG TUA \/ WALI\\nSISWA/);
  assert.match(pdf, /KOORDINATOR STUDI\\nAL-QUR'AN/);
});

test('REV37 archive releases active memberships and archived Tahfidz can be deleted permanently', () => {
  const js = read('js/learning-groups.js');
  const sql = read('supabase/20260929-25-arsip-kelompok-lepas-anggota.sql');
  assert.match(js, /gm_archive_learning_group_v2/);
  assert.match(js, /gm_delete_tahfidz_group_verified/);
  assert.match(js, /Hapus permanen/);
  assert.match(sql, /SET active = false[\s\S]*WHERE assignment_id = p_group_id/);
  assert.match(sql, /membership_aktif_dalam_kelompok_arsip/);
});

test('REV37 PWA build version is synchronized', () => {
  assert.match(read('sw.js'), /const VERSION = 'loader37'/);
  assert.match(read('js/pwa.js'), /const BUILD = 'loader37'/);
  assert.match(read('sw.js'), /\/css\/rev37-visual-fixes\.css/);
});
