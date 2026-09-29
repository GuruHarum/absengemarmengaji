const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('REV38 report uses square contained logo, transparent cells, stronger text and lines', () => {
  const pdf = read('js/report-pdf.js');
  assert.match(pdf, /const iw = image\.naturalWidth \|\| image\.width \|\| 1/);
  assert.match(pdf, /const ratio = Math\.min\(size \/ iw, size \/ ih\)/);
  assert.match(pdf, /c\.drawImage\(image, x \+ \(size - dw\) \/ 2, y \+ \(size - dh\) \/ 2, dw, dh\)/);
  assert.doesNotMatch(pdf, /c\.arc\(x \+ size \/ 2/);
  assert.match(pdf, /const programColor = 'transparent'/);
  assert.match(pdf, /const summaryColor = 'transparent'/);
  assert.match(pdf, /c\.lineWidth = \.5/);
  assert.match(pdf, /bold \? '800 ' : '600 '/);
});

test('REV38 ZIP contains one combined PDF for the selected rows', async () => {
  const code = read('js/report-zip.js');
  let buildRows = null;
  const context = {
    window: {},
    TextEncoder,
    Uint8Array,
    Uint32Array,
    Blob,
    Date,
    Error,
    Array,
    String,
    ReportPDF: {
      async build(rows, options) {
        buildRows = rows;
        options.onProgress?.(1, rows.length);
        return { output: () => new Uint8Array([37,80,68,70,45,49]).buffer };
      }
    }
  };
  context.window.ReportZip = undefined;
  vm.runInNewContext(code, context);
  const rows = [{student:{id:1}}, {student:{id:2}}, {student:{id:3}}];
  const blob = await context.window.ReportZip.build(rows, {pdfName:'Rapor Kelas 1.pdf'});
  assert.equal(buildRows.length, 3);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = Buffer.from(bytes).toString('latin1');
  assert.equal((text.match(/PK\x03\x04/g) || []).length, 1, 'ZIP harus hanya memiliki satu local file entry');
  assert.match(text, /Rapor Kelas 1\.pdf/);
});

test('REV38 login background matches the Islamic loader atmosphere', () => {
  const html = read('login.html');
  const css = read('css/rev38-report-login.css');
  assert.match(html, /rev38-report-login\.css\?v=20260929-rev38/);
  assert.match(css, /radial-gradient\(ellipse at 50% 40%, #173d36 0%, #0c2724 48%, #071c1a 100%\)/);
  assert.match(css, /M48 0 62 34 96 48 62 62 48 96 34 62 0 48 34 34Z/);
  assert.match(css, /body\.login-page \.login-card/);
});

test('REV38 report UI explains one ZIP containing one PDF with one student per page', () => {
  const html = read('admin.html');
  const cards = read('js/report-cards.js');
  assert.match(html, /satu ZIP yang berisi satu file PDF/);
  assert.match(html, /setiap siswa tetap satu halaman/);
  assert.match(cards, /ZIP selesai: 1 PDF/);
  assert.match(cards, /Membuat halaman rapor/);
});

test('REV38 PWA build version is synchronized', () => {
  assert.match(read('sw.js'), /const VERSION = 'loader38'/);
  assert.match(read('js/pwa.js'), /const BUILD = 'loader38'/);
  assert.match(read('sw.js'), /\/css\/rev38-report-login\.css/);
});
