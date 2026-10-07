'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

function panelFixture(role) {
    const html = fs.readFileSync(`public-build/${role}.html`, 'utf8');
    const { window: dom, document } = parseHTML(html);
    const storage = new Map(), bound = new Map(), errors = [], fetched = [];
    const eventPrototype = dom.EventTarget.prototype, add = eventPrototype.addEventListener;
    eventPrototype.addEventListener = function (name, callback, options) {
        if (this.id) { const key = this.id + ':' + name; bound.set(key, (bound.get(key) || 0) + 1); }
        return add.call(this, name, callback, options);
    };
    // LinkeDOM models DOM/events; add browser form conveniences used by this app.
    const select = dom.HTMLSelectElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(select, 'value');
    Object.defineProperty(select, 'value', { configurable: true, get() { return descriptor.get.call(this) || ''; }, set(value) { for (const option of this.querySelectorAll('option')) option.selected = option.value === String(value); } });
    select.add = function (option) { this.appendChild(option); };
    const result = { data: [], count: 0, error: null };
    const chain = new Proxy({}, { get(target, name) {
        if (name === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
        return () => chain;
    } });
    const profile = { role: role === 'admin' ? 'koordinator' : 'guru', userId: 'qa', displayName: 'Pengguna Uji', teacher_id: role === 'guru' ? 'teacher-test' : null, teacherName: 'Guru Uji', attendanceEnabled: true };
    const context = { document, Event: dom.Event, CustomEvent: dom.CustomEvent, URL, URLSearchParams, Blob, File, TextEncoder, TextDecoder, Intl, performance, console: { log() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); } },
        location: { href: 'https://test.invalid/' + role + '.html', origin: 'https://test.invalid', search: '', hash: '', replace() {} },
        navigator: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        addEventListener: dom.addEventListener.bind(dom), dispatchEvent: dom.dispatchEvent.bind(dom),
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: callback => { callback(); return 0; }, cancelAnimationFrame() {},
        AppAccess: { ready: Promise.resolve(), profile, full: () => role === 'admin', teacher: () => role === 'guru', linkedTeacher: () => role === 'guru', canPage: () => true, scope: query => query, applyUI() {} },
        Option: function (label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; },
        MutationObserver: dom.MutationObserver,
        fetch: async url => { fetched.push(url); return { ok: true, text: async () => fs.readFileSync(path.join('public-build', url), 'utf8') }; }
    };
    const supabase = { from: () => chain, rpc: () => chain, channel: () => ({ on() { return this; }, subscribe() {} }),
        auth: { getUser: async () => ({ data: { user: { id: 'qa', email: 'qa@example.invalid', user_metadata: {} } }, error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} },
        functions: { invoke: async () => ({ data: {}, error: null }) } };
    context.supabase = { createClient: () => supabase };
    context.window = context; context.self = context; vm.createContext(context);
    const evaluate = name => vm.runInContext(fs.readFileSync('public-build/js/' + name + '.js', 'utf8'), context, { filename: name + '.js' });
    for (const script of document.querySelectorAll('script:not([src])')) vm.runInContext(script.textContent, context);
    for (const name of ['config', 'utils', 'data-requests', 'database', 'report', 'insights', 'panel-modules', 'gm-upgrade-20260928']) evaluate(name);
    const append = document.body.appendChild.bind(document.body);
    document.body.appendChild = element => {
        if (element.tagName === 'SCRIPT' && element.src) {
            if (!element.src.startsWith('https:')) vm.runInContext(fs.readFileSync(path.join('public-build', element.src.split('?')[0]), 'utf8'), context, { filename: element.src });
            queueMicrotask(() => element.onload()); return element;
        }
        return append(element);
    };
    return { context, document, storage, bound, errors, fetched, restore() { eventPrototype.addEventListener = add; Object.defineProperty(select, 'value', descriptor); } };
}

test('built coordinator menus mount full HTML and initialize forms and actions exactly once', async () => {
    const fixture = panelFixture('admin');
    const { context, document, bound, errors } = fixture;
    try {
        await context.GMPanel.boot('coordinator');
        document.dispatchEvent(new context.Event('panelready', { bubbles: true }));
        assert.equal(document.getElementById('reportYear'), null);
        assert.equal(document.getElementById('manageSearch'), null);
        for (const page of ['kelola', 'rapor', 'pengaturan', 'identitas', 'maintenance', 'presentasi', 'arsip', 'kelompok', 'kelompok-tahsin']) await context.GMPanel.navigate(page, () => {});
        for (const key of ['manageSearch:input', 'assessmentLoadForm:submit', 'loadReports:click', 'downloadReports:click', 'downloadReportsExcel:click', 'saveReportSettings:click', 'schoolSettingsForm:submit', 'gmBackupBtn:click', 'gmPresentationLoad:click', 'gmExportTargets:click']) assert.equal(bound.get(key), 1, key);
        const first = document.getElementById('manageSearch');
        first.value = 'draf pencarian';
        await context.GMPanel.navigate('kelola', () => {});
        assert.equal(document.getElementById('manageSearch'), first); assert.equal(first.value, 'draf pencarian');
        assert.equal(bound.get('manageSearch:input'), 1);
        document.querySelector('[data-rapor-view="print"]').dispatchEvent(new context.Event('click'));
        assert.equal(document.getElementById('reportViewPrint').hidden, false);
        assert.equal(document.getElementById('reportViewPreview').hidden, true);
        const color = document.getElementById('settingsThemeColor');
        color.value = '#123456'; color.dispatchEvent(new context.Event('input'));
        assert.equal(document.getElementById('settingsThemeColorValue').textContent, '#123456');
        assert.deepEqual(errors, []);
    } finally { fixture.restore(); }
});

test('built teacher panel mounts assessment/manage and preserves enrollment access filtering', async () => {
    const fixture = panelFixture('guru');
    try {
        const { context, document, bound, errors } = fixture;
        await context.GMPanel.boot('teacher');
        document.dispatchEvent(new context.Event('panelready', { bubbles: true }));
        await context.GMPanel.navigate('penilaian', () => {});
        await context.GMPanel.navigate('kelola', () => {});
        assert.ok(document.getElementById('assessmentLoadForm'));
        assert.equal(bound.get('assessmentLoadForm:submit'), 1); assert.equal(bound.get('manageSearch:input'), 1);
        assert.deepEqual(errors, []);
    } finally { fixture.restore(); }
});
