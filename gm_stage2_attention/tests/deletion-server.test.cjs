"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
async function setup(options = {}) {
    const { createHandler } = await import('../supabase/functions/delete-school-account/handler.mjs');
    const calls = [];
    const admin = { auth: { getUser: async () => ({ data: { user: { id: 'manager' } } }), admin: { deleteUser: async (id) => { calls.push('delete:' + id); return { error: options.fail ? { code: 'storage_error' } : null }; } } }, rpc: async (name, args) => { calls.push(name); return name === 'prepare_account_deletion' ? (options.denied ? { error: { message: 'Akses ditolak' } } : { data: { id: 'job', accounts: ['user1', 'user2'] } }) : { error: null }; } };
    const run = createHandler(admin);
    return { calls, send: () => run(new Request('https://school.test', { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'teacher', target: '1' }) })) };
}
test('deletion is authorized before Auth changes and finalizes only after all Auth users are deleted', async () => {
    const app = await setup();
    assert.equal((await app.send()).status, 200);
    assert.deepEqual(app.calls, ['prepare_account_deletion', 'delete:user1', 'delete:user2', 'finish_account_deletion']);
});
test('denied deletion never calls Auth; failed Auth deletion never reports completion', async () => {
    const denied = await setup({ denied: true });
    assert.equal((await denied.send()).status, 403);
    assert.deepEqual(denied.calls, ['prepare_account_deletion']);
    const failed = await setup({ fail: true });
    assert.equal((await failed.send()).status, 409);
    assert.equal(failed.calls.includes('finish_account_deletion'), false);
});
