"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
    const nodes = {};
    const makeNode = id => ({
        id, dataset: {}, value: '', textContent: '', hidden: false, disabled: false, handlers: {}, files: [],
        addEventListener(e, cb) { this.handlers[e] = cb; },
        setAttribute(k, v) { this[k] = String(v); },
        removeAttribute(k) { delete this[k]; },
        focus() {},
        reset() { this.value = ''; this.wasReset = true; },
        querySelector() { return this.submitButton || null; }
    });
    const document = {
        handlers: {},
        getElementById(id) { return nodes[id] ||= makeNode(id); },
        addEventListener(e, cb) { (this.handlers[e] ||= []).push(cb); }
    };
    const calls = [];
    let fail = false;
    const profile = {
        role: 'guru', teacher_id: 10, teacherName: 'Pak Ahmad', teacherFullName: 'AHMAD FAUZAN, S. Pd',
        teacherPhoto: null, teacherPhotoPath: null, attendanceEnabled: true, displayName: '', temporaryPassword: false
    };
    const ctx = vm.createContext({
        document,
        console,
        location: { href: '' },
        URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
        switchPage() {},
        AppAccess: { profile, loadTeacherProfile: async () => ({ id: 10, nama: 'Pak Ahmad', attendance_enabled: true }), teacher: () => true },
        TeacherPhoto: {
            validate(file) { if (!file) throw new Error('Pilih foto'); return 'jpg'; },
            save: async (teacher) => ({ ...teacher, foto: 'https://example.test/new.jpg', foto_storage_path: 'portraits/10/new.jpg' }),
            remove: async teacher => ({ ...teacher, foto: null, foto_storage_path: null })
        },
        supabase: { auth: {
            getUser: async () => ({ data: { user: { id: 'u1', email: 'guru@example.test', user_metadata: { full_name: '', temporary_password: false } } }, error: null }),
            updateUser: async data => { calls.push(data); return { error: fail ? new Error('Server unavailable') : null }; },
            reauthenticate: async () => ({ error: null })
        } }
    });
    ctx.window = ctx;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/profile.js'), 'utf8'), ctx);

    const ids = ['profileFeedback','profileEmail','profileName','profilePassword','profileConfirm','profileNonce','profileForm','passwordForm','profileReauthenticate',
        'profilePhotoFile','profilePhotoSave','profilePhotoRemove','profilePhotoHint','profilePhotoActions','profilePhotoPreview','profilePhotoInitials','profileTeacherName','profileTeacherMeta',
        'headerProfilePhoto','headerProfileInitials','headerProfileName','headerProfileBtn','notificationBellBtn','notificationPopover','notificationBadge','notificationCountLabel','notificationList'];
    ids.forEach(id => document.getElementById(id));
    nodes.profileForm.submitButton = makeNode('saveProfile');
    nodes.passwordForm.submitButton = makeNode('savePassword');
    for (const cb of document.handlers.panelready || []) cb();
    return { ctx, nodes, calls, profile, fail: value => fail = value };
}

test('nama profil tersimpan di metadata dan langsung memperbarui identitas header', async () => {
    const app = setup();
    app.nodes.profileName.value = 'Pak Ahmad';
    await app.nodes.profileForm.handlers.submit({ preventDefault() {}, target: app.nodes.profileForm });
    assert.equal(app.calls.at(-1).data.full_name, 'Pak Ahmad');
    assert.equal(app.profile.displayName, 'Pak Ahmad');
    assert.equal(app.nodes.headerProfileName.textContent, 'Pak Ahmad');
    assert.equal(app.nodes.profileFeedback.textContent, 'Nama profil disimpan.');
});

test('password confirmation must match and failed updates do not report success', async () => {
    const app = setup();
    app.nodes.profilePassword.value = 'NewPassword123';
    app.nodes.profileConfirm.value = 'different';
    await app.nodes.passwordForm.handlers.submit({ preventDefault() {}, target: app.nodes.passwordForm });
    assert.equal(app.calls.length, 0);
    app.nodes.profileConfirm.value = 'NewPassword123';
    app.fail(true);
    await app.nodes.passwordForm.handlers.submit({ preventDefault() {}, target: app.nodes.passwordForm });
    assert.match(app.nodes.profileFeedback.textContent, /Server unavailable/);
    app.fail(false);
    await app.nodes.passwordForm.handlers.submit({ preventDefault() {}, target: app.nodes.passwordForm });
    assert.equal(app.calls.at(-1).password, 'NewPassword123');
    assert.equal(app.calls.at(-1).data.temporary_password, false);
});

test('header profile memakai foto guru terbaru dan fallback nama profil', async () => {
    const app = setup();
    app.profile.displayName = 'Pak Ahmad';
    app.profile.teacherPhoto = 'https://example.test/photo.jpg';
    app.ctx.AccountProfile.renderHeader();
    assert.equal(app.nodes.headerProfilePhoto.src, 'https://example.test/photo.jpg');
    assert.equal(app.nodes.headerProfilePhoto.hidden, false);
    assert.equal(app.nodes.headerProfileName.textContent, 'Pak Ahmad');
});
