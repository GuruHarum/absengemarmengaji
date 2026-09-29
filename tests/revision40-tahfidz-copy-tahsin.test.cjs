const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const hash = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', rel))).digest('hex');

test('Kelola Tahfidz menyediakan tombol samakan dengan siswa Tahsin', () => {
  const source = read('js/learning-groups.js');
  assert.match(source, /data-copy-tahsin/);
  assert.match(source, /Samakan dengan siswa Tahsin/);
  assert.match(source, /from\('teaching_assignments'\)/);
  assert.match(source, /eq\('subject', 'tahsin'\)/);
  assert.match(source, /from\('assessment_group_members'\)/);
  assert.match(source, /eq\('teacher_id', String\(teacher\)\)/);
  assert.match(source, /student\.kelas === cls/);
  assert.match(source, /tahsinClasses\.length === 1/);
  assert.match(source, /Pilih kelas terlebih dahulu agar kelompok Tahfidz tidak tercampur/);
  assert.match(source, /sudah berada di kelompok Tahfidz aktif lain/);
});

test('Fitur copy Tahsin hanya muncul pada editor Tahfidz', () => {
  const source = read('js/learning-groups.js');
  assert.match(source, /subject === 'tahfidz' \? '' : 'hidden'/);
  assert.match(source, /if \(subject !== 'tahfidz'\) return/);
});

test('Desain rapor tetap rollback REV39 dan output PDF gabungan tidak diubah', () => {
  const base = '/mnt/data/rev39_work';
  for (const rel of ['js/report-pdf.js','js/report-cards.js','js/report-zip.js','css/rev38-report-login.css']) {
    const current = hash(rel);
    const previous = crypto.createHash('sha256').update(fs.readFileSync(path.join(base, rel))).digest('hex');
    assert.equal(current, previous, `${rel} seharusnya tidak berubah dari REV39`);
  }
});

test('PWA dan public-build sudah menjadi loader40', () => {
  assert.match(read('sw.js'), /const VERSION = 'loader40'/);
  assert.match(read('js/pwa.js'), /const BUILD = 'loader40'/);
  assert.match(read('admin.html'), /loader40/);
  assert.equal(hash('js/learning-groups.js'), hash('public-build/js/learning-groups.js'));
});
