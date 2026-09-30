'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bundlePanelCss } = require('../scripts/bundle-panel-css.cjs');

test('panel bundle preserves CSS order, inline boundaries, and all application markup', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-panel-css-'));
    try {
        fs.cpSync(path.resolve('css'), path.join(out, 'css'), { recursive: true });
        for (const name of ['admin.html', 'guru.html']) fs.copyFileSync(name, path.join(out, name));
        bundlePanelCss(out);
        const localStyle = /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="\/?css\/)[^>]*>\s*/gi;
        const expand = (html, root) => html.replace(localStyle, tag => {
            const href = tag.match(/href="([^"]+)"/)[1].replace(/^\//, '').split('?')[0];
            return fs.readFileSync(path.join(root, href), 'utf8').replace(/\/\* Source: css\/[\w.-]+ \*\/\n/g, '').trim();
        }).replace(/\s+/g, '');
        for (const name of ['admin.html', 'guru.html']) {
            const original = fs.readFileSync(name, 'utf8');
            const built = fs.readFileSync(path.join(out, name), 'utf8');
            assert.equal(expand(built, out), expand(original, process.cwd()), name);
            assert.equal(built.split('</head>')[1], original.split('</head>')[1], 'application body unchanged');
            assert.ok([...built.matchAll(localStyle)].length < [...original.matchAll(localStyle)].length);
            const once = built;
            bundlePanelCss(out);
            assert.equal(fs.readFileSync(path.join(out, name), 'utf8'), once, 'build is idempotent');
        }
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});
