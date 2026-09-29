"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('header akun berurutan lonceng, profil, lalu keluar', () => {
    const html = fs.readFileSync('admin.html', 'utf8');
    const bell = html.indexOf('id="notificationBellBtn"');
    const profile = html.indexOf('id="headerProfileBtn"');
    const logout = html.indexOf('id="topLogoutBtn"');
    assert.ok(bell > -1 && profile > bell && logout > profile);
    assert.match(html, /id="notificationBadge"[^>]*hidden/);
});

test('foto profil dipindahkan dari modal kelola guru ke Pengaturan Profil', () => {
    const html = fs.readFileSync('admin.html', 'utf8');
    const dashboard = fs.readFileSync('js/dashboard.js', 'utf8');
    assert.match(html, /id="profilePhotoFile"/);
    assert.match(html, /id="profilePhotoPreview"/);
    assert.doesNotMatch(dashboard, /inputGuruFotoFile/);
    assert.doesNotMatch(dashboard, /inputGuruHapusFoto/);
});

test('sapaan dashboard memprioritaskan nama profil', () => {
    const upgrade = fs.readFileSync('js/gm-upgrade-20260928.js', 'utf8');
    assert.match(upgrade, /p\.displayName\|\|p\.teacherName/);
    assert.match(upgrade, /return \{dashboard,refreshIdentity/);
});
