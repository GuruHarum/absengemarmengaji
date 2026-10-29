"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');

async function setup(options = {}) {
    const { createHandler } = await import('../supabase/functions/create-teacher-account/handler.mjs');
    const calls = [];
    const admin = {
        auth: {
            getUser: async () => ({ data: { user: options.invalid ? null : { id: 'manager' } } }),
            admin: {
                createUser: async input => {
                    calls.push(['create', input]);
                    if (options.createError) return { error: { code: 'email_exists', message: 'User already registered' } };
                    return { data: { user: { id: 'new-user' } } };
                },
                deleteUser: async id => { calls.push(['delete', id]); return { error: options.cleanupError ? {} : null }; }
            }
        },
        from: table => ({
            select() { return this; },
            eq(column, value) { this.column = column; this.value = value; return this; },
            async maybeSingle() {
                if (table === 'user_roles' && this.value === 'manager')
                    return { data: { role: options.role || 'koordinator' } };
                if (table === 'teachers' && String(this.value) === '1')
                    return { data: { nama: 'Guru Lama', nama_lengkap: 'Guru Lama Lengkap', attendance_enabled: true } };
                if (table === 'user_roles' && this.value === 'new-user')
                    return { data: options.committed ? { teacher_id: '1' } : null, error: options.checkError ? {} : null };
                return { data: null };
            }
        }),
        rpc: async (name, args) => {
            calls.push(['rpc', name, args]);
            return options.provisionError ? { error: { message: 'Nama guru sudah ada' } } : { data: '1' };
        }
    };
    const handler = createHandler(admin);
    const send = (overrides = {}, token = 'token') => handler(new Request('https://example.test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ name: 'Guru Baru', full_name: 'Guru Baru Lengkap', email: 'ignored@example.test', ...overrides })
    }));
    return { calls, send };
}

test('unauthenticated users and non-manager roles cannot create accounts', async () => {
    for (const options of [{ invalid: true }, { role: 'guru' }]) {
        const app = await setup(options);
        const response = await app.send();
        assert.ok([401, 403].includes(response.status));
        assert.equal(app.calls.length, 0);
    }
    const app = await setup();
    assert.equal((await app.send({}, '')).status, 401);
});

test('automatic teacher enrollment keeps generated email fallback and initial password', async () => {
    const app = await setup();
    const response = await app.send();
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(app.calls[0][0], 'create');
    assert.equal(app.calls[0][1].email, 'guru.baru@harum.com');
    assert.equal(app.calls[0][1].password, '123456');
    assert.equal(app.calls[1][0], 'rpc');
    assert.equal(app.calls[1][2].actor_id, 'manager');
    assert.equal(app.calls[1][2].account_id, 'new-user');
    assert.equal(app.calls[1][2].linked_teacher, null);
    assert.equal(body.email, 'guru.baru@harum.com');
});

test('manual account creation uses the exact editable email and existing teacher link', async () => {
    const app = await setup();
    const response = await app.send({ manual_email: true, email: 'custom.email@example.test', teacher_id: '1' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(app.calls[0][1].email, 'custom.email@example.test');
    assert.equal(app.calls[1][2].linked_teacher, '1');
    assert.equal(app.calls[1][2].teacher_label, null);
    assert.equal(body.email, 'custom.email@example.test');
});

test('manual account creation rejects invalid email before creating an auth user', async () => {
    const app = await setup();
    const response = await app.send({ manual_email: true, email: 'bukan-email', teacher_id: '1' });
    assert.equal(response.status, 400);
    assert.equal(app.calls.length, 0);
});

test('manual account creation refuses an existing email without trying a different address', async () => {
    const app = await setup({ createError: true });
    const response = await app.send({ manual_email: true, email: 'already@example.test', teacher_id: '1' });
    assert.equal(response.status, 409);
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0][1].email, 'already@example.test');
    assert.equal(app.calls.some(row => row[0] === 'rpc'), false);
    assert.equal(app.calls.some(row => row[0] === 'delete'), false);
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
