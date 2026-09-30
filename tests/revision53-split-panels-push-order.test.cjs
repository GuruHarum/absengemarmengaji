'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const login = read('login.html');
const admin = read('admin.html');
const guru = read('guru.html');
const preboot = read('js/panel-preboot.js');
const teacherStart = read('js/panel-start-guru.js');
const adminStart = read('js/panel-start.js');
const assessments = read('js/assessments.js');
const push = read('js/push-notifications.js');
const sw = read('sw.js');
const build = read('scripts/build-static.cjs');

assert.match(login, /access\.role === 'guru' \? 'guru\.html' : 'admin\.html'/, 'login harus merutekan guru ke guru.html');
assert.match(admin, /data-panel="coordinator"/, 'admin.html harus menjadi panel koordinator/admin');
assert.match(guru, /data-panel="teacher"/, 'guru.html harus menjadi panel guru');
assert.match(adminStart, /GMPanelPreboot\.prepare\('coordinator'\)/, 'admin harus memakai guard role');
assert.match(teacherStart, /GMPanelPreboot\.prepare\('teacher'\)/, 'guru harus memakai guard role');
assert.match(preboot, /location\.replace\(`guru\.html/, 'guru yang membuka admin harus dialihkan');
assert.match(preboot, /location\.replace\(`admin\.html/, 'non-guru yang membuka guru harus dialihkan');

for (const id of ['menu-rapor','menu-laporan','menu-analitik','menu-presentasi','menu-pengaturan','menu-maintenance']) {
  assert.ok(!guru.includes(`id="${id}"`), `${id} tidak boleh ada di panel guru`);
}
for (const id of ['menu-dashboard','menu-absensi','menu-kelola','menu-kelompok-tahsin','menu-kelompok','menu-penilaian','menu-profil']) {
  assert.ok(guru.includes(`id="${id}"`), `${id} harus tetap ada di panel guru`);
}
assert.ok(!guru.includes('chart.js'), 'panel guru tidak boleh memuat Chart.js');
for (const heavy of ['report-pdf.js','report-zip.js','report-cards.js','report-settings.js','accounts.js','system-reset.js','student-import.js']) {
  assert.ok(!teacherStart.includes(heavy), `panel guru tidak boleh memuat ${heavy}`);
}
assert.match(teacherStart, /assessments\.js/, 'penilaian harus tetap dimuat di panel guru');
assert.match(teacherStart, /learning-groups\.js/, 'kelompok harus tetap dimuat di panel guru');
assert.match(teacherStart, /profile\.js/, 'profil harus tetap dimuat di panel guru');
assert.match(teacherStart, /notifications\.js/, 'notifikasi harus tetap dimuat di panel guru');

assert.match(preboot, /AppAccess\.profile\?\.role !== 'guru'/, 'onboarding push hanya untuk guru');
assert.match(preboot, /!standalone\(\)/, 'onboarding push hanya saat PWA terpasang');
assert.match(preboot, /Notification\.requestPermission\(\)/, 'izin notifikasi harus berasal dari klik pengguna');
assert.match(preboot, /gm_push_first_login_v53/, 'onboarding harus diingat per pengguna');
assert.match(push, /GM_PUSH_BOOT_PERMISSION === 'granted'/, 'izin preboot harus dilanjutkan menjadi subscription push');
assert.match(push, /enable\(\{ quiet:/, 'aktivasi push preboot harus bisa diam-diam');

assert.match(assessments, /displayOrder = String\(Math\.max\(1, Number\(orderNumber\)/, 'nomor kartu harus dinamis');
assert.match(assessments, /assessment-card-order/, 'nomor urut siswa harus tampil di header kartu');
assert.match(assessments, /\$\{displayOrder\}<\/span>/, 'header kartu harus memakai nomor urut dinamis');
assert.ok(!assessments.includes('<legend><span>${displayOrder}</span> Tahsin</legend>'), 'legend bernomor Tahsin harus dihapus');
assert.ok(!assessments.includes('<legend><span>${displayOrder}</span> Tahfidz</legend>'), 'legend bernomor Tahfidz harus dihapus');

assert.match(sw, /loader54/, 'service worker harus loader54');
assert.match(sw, /'\/guru\.html'/, 'guru.html harus ikut shell PWA');
assert.match(build, /'guru\.html'/, 'build harus menyertakan guru.html');
assert.match(build, /loader54/, 'build harus ditandai loader54');
console.log('REV53 split panels / push onboarding / assessment order: OK');
