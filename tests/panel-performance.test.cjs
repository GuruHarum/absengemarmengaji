'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const source = fs.readFileSync('js/panel-modules.js', 'utf8');
function fixture() {
    const listeners = new Map(), requests = [], failures = new Set();
    const context = { Event, console, window: {}, document: {
        addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
        createElement() { return { remove() {} }; },
        body: { appendChild(script) { requests.push(script); queueMicrotask(() => failures.has(script.src) ? script.onerror() : script.onload()); } }
    }};
    vm.runInNewContext(source, context);
    return { context, panel: context.window.GMPanel, requests, failures, ready() { for (const fn of listeners.get('panelready') || []) fn(new Event('panelready')); } };
}
test('initial boot retains shared profile and curriculum but defers assessment, report and PDF', async () => {
    const f = fixture(); await f.panel.boot('coordinator');
    const urls = f.requests.map(s => s.src);
    assert(urls.some(u => u.includes('/profile.js')));
    assert(urls.some(u => u.includes('/curriculum-targets.js')));
    assert(!urls.some(u => /assessments\.js|report-cards|jspdf|chart\.js/.test(u)));
    assert(f.requests.every(s => s.async === false));
});
test('attendance roster is requested on menu entry and refreshed after hidden-menu invalidation', async () => {
    const f = fixture(); let fetches = 0, opened = 0;
    f.context.ensureAttendanceWorkspaceData = async () => {
        fetches++; f.context.window.tahsinRosterStudents = []; f.context.window.tahsinRosterTeachers = [];
        f.context.window.GM_ROSTER_DIRTY = false;
    };
    await f.panel.navigate('dashboard', () => opened++); assert.equal(fetches, 0);
    await f.panel.navigate('absensi', () => opened++); assert.equal(fetches, 1);
    await f.panel.navigate('absensi', () => opened++); assert.equal(fetches, 1);
    f.context.window.GM_ROSTER_DIRTY = true;
    await f.panel.navigate('absensi', () => opened++); assert.equal(fetches, 2); assert.equal(opened, 4);
});
test('concurrent report opens load dependencies once and Word does not download PDF libraries', async () => {
    const f = fixture(); await Promise.all([f.panel.load('reports'), f.panel.load('reports')]);
    const urls = f.requests.map(s => s.src);
    assert.equal(new Set(urls).size, urls.length);
    assert(urls.findIndex(u => u.includes('progress-form')) < urls.findIndex(u => /\/assessments\.js/.test(u)));
    assert(urls.findIndex(u => /\/assessments\.js/.test(u)) < urls.findIndex(u => u.includes('report-cards')));
    assert(!urls.some(u => u.includes('jspdf')));
    await f.panel.load('pdf'); assert.equal(f.requests.filter(s => s.src.includes('jspdf')).length, 2);
});
test('callbacks registered before and after panelready each initialize once', () => {
    const f = fixture(); let before = 0, after = 0;
    f.panel.onReady(() => before++); f.ready(); f.panel.onReady(() => after++);
    assert.equal(before, 1); assert.equal(after, 1);
});
test('latest navigation wins while rapid return to dashboard cancels pending menu', async () => {
    const f = fixture(); const opened = [];
    const pending = f.panel.navigate('rapor', () => opened.push('rapor'));
    f.panel.navigate('dashboard', () => opened.push('dashboard'));
    await pending; assert.deepEqual(opened, ['dashboard']);
    await f.panel.navigate('rapor', () => opened.push('rapor'));
    assert.deepEqual(opened, ['dashboard', 'rapor']);
});
test('failed feature requests can retry without duplicate successful dependencies', async () => {
    const f = fixture(); const url = 'js/assessments.js?v=20261007-data63'; f.failures.add(url);
    await assert.rejects(f.panel.load('assessment')); f.failures.clear(); await f.panel.load('assessment');
    assert.equal(f.requests.filter(s => s.src === url).length, 2);
    assert.equal(f.requests.filter(s => s.src.includes('progress-form')).length, 1);
});
test('teacher boot and manage do not initialize coordinator enrollment or curriculum', async () => {
    const f = fixture(); await f.panel.boot('teacher'); await f.panel.load('manage');
    assert(!f.requests.some(s => /enrollment|curriculum-targets/.test(s.src)));
});
test('generated bundles parse and preserve global declarations and role-specific loading', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-panel-build-'));
    try {
        fs.cpSync('js', path.join(out, 'js'), { recursive: true });
        const assets = require('../scripts/bundle-panel-js.cjs').bundlePanelJs(out);
        assert.equal(assets.core.length, 1);
        for (const files of Object.values(assets)) for (const file of files) new vm.Script(fs.readFileSync(path.join(out, file), 'utf8'));
        const loader = fs.readFileSync(path.join(out, 'js/panel-modules.js'), 'utf8');
        assert.match(loader, /role !== 'teacher' \? \[\.\.\.built/);
        assert.match(fs.readFileSync(path.join(out, assets.core[0]), 'utf8'), /function switchPage\(pageId\)/);
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
test('attendance refresh preserves unchanged rows and replaces only edited or paginated rows', () => {
    let mutations = 0;
    class Body {
        constructor() { this.children = []; }
        set innerHTML(value) {
            this.children = [...value.matchAll(/<tr data-log-row="([^"]+)"[\s\S]*?<\/tr>/g)].map(match => {
                const row = { dataset: { logRow: match[1] }, outerHTML: match[0], parent: this };
                row.remove = () => { const index = row.parent.children.indexOf(row); if (index >= 0) row.parent.children.splice(index, 1); mutations++; };
                return row;
            });
        }
        querySelectorAll(selector) { return selector === '[data-log-row]' ? this.children : []; }
        insertBefore(row, before) {
            if (row.parent) { const index = row.parent.children.indexOf(row); if (index >= 0) row.parent.children.splice(index, 1); }
            this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, row);
            row.parent = this; mutations++;
        }
    }
    const table = new Body();
    const context = { window: {}, document: { createElement: () => new Body() }, adminDataList: table,
        currentPage: 1, recordsPerPage: 2, recordCount: {}, pageIndicator: {}, updatePaginationButtons() {},
        filteredAttendanceData: [{ id: 1, student: 'Satu', status: 'hadir' }, { id: 2, student: 'Dua', status: 'hadir' }, { id: 3, student: 'Tiga', status: 'izin' }],
        escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;'), attendanceLogAction() {} };
    const admin = fs.readFileSync('js/admin.js', 'utf8');
    vm.runInNewContext(admin.slice(admin.indexOf('function renderAdminData()'), admin.indexOf('async function attendanceLogAction')), context);
    context.renderAdminData(); const original = [...table.children]; mutations = 0;
    context.renderAdminData(); assert.equal(mutations, 0); assert.equal(table.children[0], original[0]);
    context.filteredAttendanceData[1].status = 'sakit'; context.renderAdminData();
    assert.equal(table.children[0], original[0]); assert.notEqual(table.children[1], original[1]);
    context.filteredAttendanceData.shift(); context.renderAdminData();
    assert.deepEqual(table.children.map(row => row.dataset.logRow), ['2', '3']);
    assert.equal(context.recordCount.textContent, 2);
    context.window.GM_ATTENDANCE_LOG_PAGE = { total: 35, page: 2 };
    context.currentPage = 2;
    context.renderAdminData();
    assert.equal(context.recordCount.textContent, 35);
    assert.deepEqual(table.children.map(row => row.dataset.logRow), ['2', '3']);
});
test('PWA separates asset versions and reuses cached content-hashed bundles without network', async () => {
    let fetches = 0;
    const cached = { name: 'cached' }, fresh = { ok: true, type: 'basic', clone() { return this; } };
    const context = { Request, URL, console, self: { addEventListener() {} },
        caches: { open: async () => ({ match: async () => cached, put: async () => {} }), match: async () => cached },
        fetch: async () => { fetches++; return fresh; } };
    vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), context);
    assert.notEqual(context.normalizedRequest(new URL('https://example.test/js/profile.js?v=old')).url,
        context.normalizedRequest(new URL('https://example.test/js/profile.js?v=new')).url);
    const result = await context.staleWhileRevalidate({ destination: 'script' }, new URL('https://example.test/js/panel-012345abcdef.js'));
    assert.equal(result, cached); assert.equal(fetches, 0);
    assert.equal(await context.staleWhileRevalidate({ destination: 'style' }, new URL('https://example.test/css/tailwind-012345abcdef.css')), cached);
    assert.equal(fetches, 0);
    assert.equal(await context.staleWhileRevalidate({ destination: '' }, new URL('https://example.test/pages/admin-rapor-012345abcdef.html')), cached);
    assert.equal(fetches, 0);
    assert.equal(await context.staleWhileRevalidate({ destination: 'script' }, new URL('https://example.test/js/profile.js?v=new')), fresh);
    assert.equal(fetches, 1);
});
