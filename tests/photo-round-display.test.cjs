const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
test('Foto guru Tahsin berbentuk bulat di kartu absensi', () => {
  const ui = source('js/ui.js');
  assert.match(ui, /teacher-photo-circle--public/);
  assert.match(ui, /teacher-photo-circle--placeholder/);
});
test('Foto guru Tahsin bulat di tabel dan pratinjau pengelolaan guru', () => {
  const dashboard = source('js/dashboard.js');
  assert.match(dashboard, /teacher-photo-circle--small/);
  assert.match(dashboard, /teacher-photo-circle--preview/);
});
test('Bentuk bulat, crop terpusat, dan rasio persegi diterapkan tanpa mengubah foto di storage', () => {
  const css = source('css/theme.css');
  assert.match(css, /\.teacher-photo-circle\s*\{/);
  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /border-radius:\s*50%/);
  assert.match(css, /object-fit:\s*cover/);
  assert.match(css, /object-position:\s*center/);
});
