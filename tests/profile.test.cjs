"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup() {
    const nodes = {};
    const document = { handlers: {}, getElementById: id => nodes[id] ||= ({ dataset: {}, value: '', textContent: '', handlers: {}, addEventListener(e, cb) { this.handlers[e] = cb; } }), addEventListener(e, cb) { this.handlers[e] = cb; } };
    const calls = [];
    let fail = false;
    const ctx = vm.createContext({ document, supabase: { auth: { updateUser: async (data) => { calls.push(data); return { error: fail ? new Error('Server unavailable') : null }; } } } });
    ctx.window = ctx;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/profile.js'), 'utf8'), ctx);
    document.handlers.panelready();
    for (const id of ['profilePassword', 'profileConfirm', 'profileNonce'])
        document.getElementById(id);
    const button = {};
    let reset = false;
    const form = { querySelector: () => button, reset() { reset = true; } };
    return { nodes, calls, button, reset: () => reset, fail: value => fail = value, save: () => nodes.passwordForm.handlers.submit({ preventDefault() { }, target: form }) };
}
test('password confirmation must match and failed updates do not report success', async () => {
    const app = setup();
    app.nodes.profilePassword.value = 'NewPassword123';
    app.nodes.profileConfirm.value = 'different';
    await app.save();
    assert.equal(app.calls.length, 0);
    app.nodes.profileConfirm.value = 'NewPassword123';
    app.fail(true);
    await app.save();
    assert.equal(app.reset(), false);
    assert.match(app.nodes.profileFeedback.textContent, /Server unavailable/);
    assert.equal(app.button.disabled, false);
    app.fail(false);
    await app.save();
    assert.equal(app.reset(), true);
    assert.equal(app.calls.at(-1).password, 'NewPassword123');
    assert.equal(app.calls.at(-1).data.temporary_password, false);
});
