'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { optimizeStatic } = require('../scripts/optimize-static.cjs');

test('static optimization preserves handlers, dynamic utilities, markup and final cache hashes', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-static-'));
    try {
        fs.mkdirSync(path.join(out, 'js'));
        fs.mkdirSync(path.join(out, 'css'));
        const html = '<html><head><style>.custom{color:red}</style></head><body><button class="p-4 hover:bg-slate-50" onclick="editAttendance(3)">Edit</button><script src="https://cdn.tailwindcss.com"></script></body></html>';
        fs.writeFileSync(path.join(out, 'admin.html'), html);
        fs.writeFileSync(path.join(out, 'sw.js'), 'const PRECACHE = [];');
        const source = 'function editAttendance(id) { return id + 7; }\nwindow.reportClass = "md:grid-cols-3";\n';
        const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
        fs.writeFileSync(path.join(out, 'js', `panel-${hash}.js`), source);
        fs.writeFileSync(path.join(out, 'css', 'local.css'), '.custom { background: url(../assets/school-logo.png); }');
        await optimizeStatic(out);
        const built = fs.readFileSync(path.join(out, 'admin.html'), 'utf8');
        assert.ok(!built.includes('cdn.tailwindcss.com'));
        const sheet = built.match(/href="(css\/tailwind-[a-f0-9]{12}\.css)"/)[1];
        assert.equal(built.replace(/<link rel="stylesheet"[^>]+>\n/, ''), html.replace('<script src="https://cdn.tailwindcss.com"></script>', ''));
        const css = fs.readFileSync(path.join(out, sheet), 'utf8');
        assert.ok(css.includes('.p-4'));
        assert.ok(css.includes('.md\\:grid-cols-3'));
        assert.ok(fs.readFileSync(path.join(out, 'sw.js'), 'utf8').includes(sheet));
        const script = fs.readdirSync(path.join(out, 'js'))[0];
        const bytes = fs.readFileSync(path.join(out, 'js', script));
        assert.ok(script.includes(crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12)));
        assert.ok(bytes.length < Buffer.byteLength(source));
        const context = { window: {} }; vm.createContext(context); vm.runInContext(bytes.toString(), context);
        assert.equal(context.editAttendance(3), 10);
        assert.equal(context.window.reportClass, 'md:grid-cols-3');
        assert.ok(fs.readFileSync(path.join(out, 'css/local.css'), 'utf8').includes('../assets/school-logo.png'));
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
