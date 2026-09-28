"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('admin.html', 'utf8');
const js = fs.readFileSync('js/dashboard.js', 'utf8');
const access = fs.readFileSync('js/access.js', 'utf8');
const css = fs.readFileSync('css/layout-responsive.css', 'utf8');
const cards = fs.readFileSync('js/report-cards.js', 'utf8');
const settings = fs.readFileSync('js/settings-hub.js', 'utf8');
test('school profile appears only on dedicated sidebar page with familiar header', () => {
    assert.match(html, /id="menu-identitas"[^>]*onclick="switchPage\('identitas'\)"/);
    const school = html.match(/id="page-identitas"[\s\S]*?(?=<div id="page-pengaturan")/)[0];
    assert.match(school, /class="section-heading"/);
    for (const id of ['schoolSettingsForm', 'settingsSchoolName', 'settingsSchoolAddress', 'settingsSchoolLogo', 'settingsThemeColor', 'settingsLogoPreview'])
        assert.ok(school.includes(`id="${id}"`), id);
    assert.ok(!html.match(/id="page-pengaturan"[\s\S]*?id="schoolSettingsForm"/));
    assert.match(js, /if \(pageId === 'identitas'\)\s*loadSchoolSettings\(\)/);
    assert.match(access, /'identitas'/);
});
test('system settings keeps only report, accounts and reference', () => {
    for (const name of ['report', 'accounts', 'reference'])
        assert.match(settings, new RegExp(`['"]${name}['"]`));
    assert.doesNotMatch(html, /data-settings-view="school"/);
    assert.match(settings, /let current = 'report'/);
});
test('report picker is grouped and status is readable rather than a run-on line', () => {
    for (const id of ['reportClass', 'reportSearch', 'reportStudent', 'reportPrevious', 'reportNext', 'reportStudentStatus', 'reportDataAudit'])
        assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
    assert.match(html, /class="report-selection-fields"/);
    assert.match(html, /class="report-selection-navigation"/);
    assert.match(html, /id="reportIdentityDetails" class="report-identity-details"/);
    assert.match(cards, /report-status-metrics/);
    assert.match(cards, /status\.replaceChildren\(badge, metrics\)/);
    assert.match(css, /report-selection-navigation/);
    assert.match(css, /report-selection-fields/);
    assert.match(css, /max-width:\s*1180px/);
});
test('Netlify static build publishes equivalent PWA cache headers for ZIP upload', () => {
    const script = fs.readFileSync('scripts/build-static.cjs', 'utf8');
    const headers = fs.readFileSync('_headers', 'utf8');
    assert.match(script, /'_headers'/);
    assert.match(headers, /\/sw\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
    assert.match(headers, /\/manifest\.webmanifest[\s\S]*Content-Type: application\/manifest\+json/);
});
