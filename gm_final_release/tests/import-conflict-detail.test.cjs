const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'js', 'dashboard.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'admin-polish.css'), 'utf8');

assert.match(dashboard, /DATA YANG WAJIB DIPERIKSA/);
assert.match(dashboard, /NISN sama dengan baris/);
assert.match(dashboard, /NIS sama dengan baris/);
assert.match(dashboard, /Ditemukan sama\/terkait dengan:/);
assert.match(dashboard, /Baris \$\{row\.row\}: \$\{row\.nama/);
assert.match(dashboard, /NISN  : \$\{row\.nisn/);
assert.match(css, /max-height:\s*520px/);

console.log('import conflict detail UI test: OK');
