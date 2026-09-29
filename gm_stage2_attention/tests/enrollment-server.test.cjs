"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
async function setup(options = {}) {
    const { createHandler } = await import('../supabase/functions/create-teacher-account/handler.mjs');
    const calls = [];
    const admin = { auth: { getUser: async () => ({ data: { user: options.invalid ? null : { id: 'manager' } } }), admin: {
                createUser: async (input) => { calls.push(['create', input]); return options.createError ? { error: { message: 'duplicate' } } : { data: { user: { id: 'new-user' } } }; },
                deleteUser: async (id) => { calls.push(['delete', id]); return { error: options.cleanupError ? {} : null }; }
            } },
        from: () => ({ select() { return this; }, eq(column, value) { this.value = value; return this; }, async maybeSingle() {
                if (this.value === 'manager')
                    return { data: { role: options.role || 'koordinator' } };
                return { data: options.committed ? { teacher_id: '1' } : null, error: options.checkError ? {} : null };
            } }), rpc: async (name, args) => { calls.push(['rpc', args]); return options.provisionError ? { error: { message: 'Nama guru sudah ada' } } : { data: '1' }; } };
    const handler = createHandler(admin);
    const send = (overrides = {}, token = 'token') => handler(new Request('https://example.test', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ email: 'teacher@example.test', password: 'Temporary123!', name: 'Guru Baru', full_name: 'Guru Baru Lengkap', ...overrides }) }));
    return { calls, send };
}
test('unauthenticated and teacher requests cannot create accounts', async () => {
    for (const options of [{ invalid: true }, { role: 'guru' }]) {
        const app = await setup(options);
        const response = await app.send();
        assert.ok([401, 403].includes(response.status));
        assert.equal(app.calls.length, 0);
    }
    const app = await setup();
    assert.equal((await app.send({}, '')).status, 401);
});
test('manager creates auth account then provisions only a teacher role, without returning password', async () => {
    const app = await setup();
    const response = await app.send({ role: 'admin' });
    assert.equal(response.status, 200);
    assert.equal(app.calls[0][0], 'create');
    assert.equal(app.calls[1][0], 'rpc');
    assert.equal(app.calls[1][1].actor_id, 'manager');
    assert.equal(app.calls[1][1].account_id, 'new-user');
    assert.equal(app.calls[1][1].role, undefined);
    assert.equal(app.calls[0][1].user_metadata.temporary_password, true);
    assert.doesNotMatch(await response.text(), /Temporary123/);
});
test('invalid password is rejected before auth account creation', async () => {
    const app = await setup();
    assert.equal((await app.send({ password: 'short' })).status, 400);
    assert.equal(app.calls.length, 0);
});
test('failed provisioning cleans up only an unmapped new account', async () => {
    const app = await setup({ provisionError: true });
    assert.equal((await app.send()).status, 400);
    assert.equal(app.calls.at(-1)[0], 'delete');
    const committed = await setup({ provisionError: true, committed: true });
    assert.equal((await committed.send()).status, 200);
    assert.equal(committed.calls.some(row => row[0] === 'delete'), false);
    const uncertain = await setup({ provisionError: true, checkError: true });
    assert.equal((await uncertain.send()).status, 503);
    assert.equal(uncertain.calls.some(row => row[0] === 'delete'), false);
});
test('existing email errors do not attempt role changes or delete existing accounts', async () => {
    const app = await setup({ createError: true });
    assert.equal((await app.send()).status, 400);
    assert.equal(app.calls.length, 1);
});
