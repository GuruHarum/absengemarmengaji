"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('js/dashboard.js', 'utf8');
const begin = code.indexOf('function switchPage(pageId) {');
const end = code.indexOf("document.addEventListener('panelready'", begin);
assert.ok(begin >= 0 && end > begin);
const snippet = code.slice(begin, end);
const pages = ['rapor', 'absensi', 'kelola', 'kelompok', 'profil', 'penilaian', 'infografik', 'identitas', 'pengaturan', 'maintenance'];
function dom() {
    const nodes = new Map();
    for (const id of [...pages.flatMap(s => [`page-${s}`, `menu-${s}`]), 'adminHeaderTitle', 'adminPageTitle', 'adminPageDescription']) {
        const attrs = new Map(), classes = new Set(['hidden']);
        nodes.set(id, {
            id, textContent: '', attrs,
            classList: { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x), contains: x => classes.has(x) },
            setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k)
        });
    }
    return { nodes, getElementById: id => nodes.get(id) };
}
test('dedicated school page updates the shared header, sidebar and loads existing profile form', () => {
    const doc = dom(), calls = [];
    const context = vm.createContext({
        document: doc, requestAnimationFrame: callback => callback(),
        AppAccess: { canPage: () => true },
        loadSchoolSettings: () => calls.push('school'),
        setMobileDrawer: () => calls.push('close'),
        SettingsHub: { open: () => calls.push('settings') },
        ReportSettings: { open: () => calls.push('reports') },
        loadAccountSettings: () => Promise.resolve(),
    });
    vm.runInContext(snippet, context);
    context.switchPage('identitas');
    assert.equal(doc.getElementById('adminHeaderTitle').textContent, 'Identitas Sekolah');
    assert.equal(doc.getElementById('adminPageTitle').textContent, 'Profil sekolah dalam satu halaman.');
    assert.equal(doc.getElementById('menu-identitas').getAttribute('aria-current'), 'page');
    assert.equal(doc.getElementById('page-identitas').classList.contains('hidden'), false);
    assert.deepEqual(calls, ['school', 'close']);
    context.switchPage('pengaturan');
    assert.equal(doc.getElementById('adminHeaderTitle').textContent, 'Pengaturan Sistem');
    assert.equal(doc.getElementById('page-identitas').classList.contains('hidden'), true);
    assert.deepEqual(calls, ['school', 'close', 'settings', 'reports', 'close']);
});
