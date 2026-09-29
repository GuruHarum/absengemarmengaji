const fs = require('node:fs');
const assert = require('node:assert/strict');
const admin = fs.readFileSync('admin.html','utf8');
const reports = fs.readFileSync('js/report-cards.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');

assert.match(admin, /<option value="grade">Satu tingkat \(semua rombel\)<\/option>/);
assert.match(admin, /<option value="class">Satu rombel<\/option>/);
assert.match(admin, /id="reportDownloadClassField"[^>]*hidden/);
assert.doesNotMatch(admin, /Per guru pembimbing dalam rombel/);
assert.doesNotMatch(admin, /reportDownloadSubject/);
assert.doesNotMatch(admin, /reportDownloadTeacher/);
assert.match(reports, /if \(mode !== 'class'\) return \{ rows: \[\.\.\.rows\], label: `Kelas \$\{el\('reportGrade'\)\.value\}` \}/);
assert.match(reports, /rows\.filter\(row => row\.student\.class === className\)/);
assert.match(reports, /Pilih rombel yang akan diunduh terlebih dahulu/);
assert.match(sw, /const VERSION = 'loader35'/);
console.log('revision35 report download scope OK');
