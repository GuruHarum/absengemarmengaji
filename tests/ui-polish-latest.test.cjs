const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('assessment result summary is a block and narrow screens stack score fields', () => {
  const js = read('js/assessments.js');
  const css = read('css/layout-responsive.css');
  assert.match(js, /data-report-summary class="assessment-result-summary"/);
  assert.match(css, /\.assessment-result-summary\s*\{[\s\S]*?display:\s*block/);
  assert.match(css, /@media screen and \(max-width: 430px\)[\s\S]*?\.assessment-score-grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)/);
});

test('admin actions no longer use browser alert or browser confirm', () => {
  const files = ['js/settings-hub.js','js/report-settings.js','js/api.js','js/database.js'];
  const joined = files.map(read).join('\n');
  assert.doesNotMatch(joined, /window\.(alert|confirm)\s*\(/);
  assert.doesNotMatch(joined, /(^|[^.\w])(alert|confirm)\s*\(/m);
  assert.match(joined, /AdminNotice\.confirm/);
});

test('public attendance loads the same toast notification component', () => {
  const html = read('index.html');
  assert.match(html, /js\/admin-notices\.js/);
  assert.ok(html.indexOf('js/admin-notices.js') < html.indexOf('js/ui.js'));
});

test('service worker cache version is bumped for responsive stylesheet update', () => {
  const sw = read('sw.js');
  assert.match(sw, /gemar-static-20260928-ui-reset-1/);
  assert.match(sw, /\/css\/layout-responsive\.css/);
});
