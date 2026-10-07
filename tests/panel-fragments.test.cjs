'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { splitPanelPages } = require('../scripts/split-panel-pages.cjs');

test('panel fragments reconstruct every original byte and retain all controls and print content', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-fragments-'));
    try {
        for (const role of ['admin', 'guru']) fs.copyFileSync(role + '.html', path.join(out, role + '.html'));
        splitPanelPages(out);
        for (const role of ['admin', 'guru']) {
            const original = fs.readFileSync(role + '.html', 'utf8');
            let built = fs.readFileSync(path.join(out, role + '.html'), 'utf8');
            const context = { window: {} };
            const manifestTag = built.match(/<script>window.GM_PANEL_PAGES=.*?<\/script>\n/)[0];
            vm.runInNewContext(manifestTag.replace(/<\/?script>/g, '').trim(), context);
            const pages = context.window.GM_PANEL_PAGES;
            assert.ok(Object.keys(pages).length >= 4);
            for (const [page, url] of Object.entries(pages)) {
                const fragment = fs.readFileSync(path.join(out, url), 'utf8');
                assert.ok(url.includes(crypto.createHash('sha256').update(fragment).digest('hex').slice(0, 12)));
                const pattern = new RegExp('(<div\\b[^>]*\\bid="page-' + page + '"[^>]*>)(</div>)');
                assert.ok(pattern.test(built), page);
                built = built.replace(pattern, (_, opening, close) => opening + fragment + close);
            }
            built = built.replace(manifestTag, '');
            assert.equal(built, original);
        }
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('HTML is mounted before module initialization, concurrent loads share fetch and failed pages can retry', async () => {
    const requests = [], scripts = [], callbacks = [], listeners = [], page = { innerHTML: '' };
    let failing = true;
    const context = { Event, console: { error() {} }, window: { GM_PANEL_PAGES: { penilaian: 'pages/assessment.html' } },
        fetch: async url => { requests.push(url); return { ok: !failing, text: async () => '<form id="assessment"></form>' }; },
        document: { addEventListener(name, callback) { if (name === 'panelready') listeners.push(callback); }, getElementById() { return page; }, createElement() { return {}; },
            body: { appendChild(script) { assert.ok(page.innerHTML.includes('assessment')); scripts.push(script.src); queueMicrotask(script.onload); } } } };
    vm.runInNewContext(fs.readFileSync('js/panel-modules.js', 'utf8'), context);
    const panel = context.window.GMPanel;
    panel.onPage('penilaian', () => callbacks.push('initialized'));
    await assert.rejects(panel.load('assessment')); assert.equal(scripts.length, 0);
    failing = false;
    await Promise.all([panel.load('assessment'), panel.load('assessment')]);
    assert.equal(requests.length, 2); assert.ok(page.innerHTML.includes('assessment'));
    assert.equal(new Set(scripts).size, scripts.length);
    listeners.forEach(callback => callback(new Event('panelready')));
    assert.deepEqual(callbacks, ['initialized']);
    await panel.load('assessment'); assert.deepEqual(callbacks, ['initialized']);
});
