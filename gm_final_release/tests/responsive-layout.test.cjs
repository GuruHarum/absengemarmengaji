"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/layout-responsive.css'), 'utf8');
test('shared responsive stylesheet is last for all interactive HTML pages', () => {
    for (const name of ['admin.html', 'index.html', 'login.html', 'maintenance.html']) {
        const html = fs.readFileSync(path.join(root, name), 'utf8');
        const link = html.lastIndexOf('css/layout-responsive.css');
        assert.ok(link > 0, `${name} must load responsive rules`);
        assert.ok(link > html.lastIndexOf('css/pwa.css'), `${name} should load layout rules after PWA and previous styles`);
        assert.ok(link < html.indexOf('</head>'), `${name} should load CSS in <head>`);
    }
});
test('desktop short viewport allows entire sidebar scrolling; normal desktop allows nav scrolling', () => {
    assert.match(css, /min-width:\s*768px\)\s*and\s*\(max-height:\s*780px/);
    assert.match(css, /body\.admin-page #sidebar\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(css, /body\.admin-page #sidebar \.admin-navigation\s*\{[^}]*flex:\s*1 1 auto[^}]*overflow-y:\s*auto/s);
});
test('mobile drawer uses viewport height and independently scrolls navigation', () => {
    assert.match(css, /max-width:\s*767px/);
    assert.match(css, /#sidebar > \.sidebar-shell\s*\{[^}]*height:\s*100%/s);
    assert.match(css, /max-height:\s*540px/);
});
test('rapor, settings, forms and tables respond to narrow screens without changing theme variables', () => {
    for (const selector of ['report-workspace', 'report-preview', 'report-table-scroll', 'target-cards', 'settings-hub', 'assessment-summary', 'admin-workspace'])
        assert.ok(css.includes(selector), selector);
    assert.doesNotMatch(css, /font-family:|background:\s*linear-gradient/);
});
test('service worker version and cache include the new static CSS', () => {
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    assert.match(sw, /const VERSION = 'loader33'/);
    assert.ok(sw.includes('/css/layout-responsive.css'));
    assert.doesNotMatch(sw, /caches\.open\([^)]*\).*supabase/);
});
