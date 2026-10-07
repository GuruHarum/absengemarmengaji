'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(rows = []) {
    const reads = [], listeners = {}, channel = { on() { return this; }, subscribe() {} };
    const context = { console: { log() {}, error() {}, warn() {} }, window: {}, document: { body: { dataset: {} }, getElementById() {} },
        supabase: { channel() { return channel; }, from(table) {
            const state = { table, columns: '*', conditions: [], range: null };
            const query = {
                select(columns, options) { state.columns = columns; state.count = options?.count; return this; },
                eq(key, value) { state.conditions.push(row => String(row[key]) === String(value)); return this; },
                gte(key, value) { state.conditions.push(row => row[key] >= value); return this; },
                lte(key, value) { state.conditions.push(row => row[key] <= value); return this; },
                in(key, values) { state.conditions.push(row => values.includes(row[key])); return this; },
                order() { return this; }, range(from, to) { state.range = [from, to]; return this; },
                then(resolve, reject) {
                    reads.push({ ...state });
                    const all = rows.filter(row => state.conditions.every(condition => condition(row)));
                    const selected = state.range ? all.slice(state.range[0], state.range[1] + 1) : all;
                    const data = state.columns === '*' ? selected : selected.map(row => Object.fromEntries(state.columns.split(',').map(key => [key, row[key]])));
                    return Promise.resolve({ data, count: state.count ? all.length : null, error: null }).then(resolve, reject);
                }
            };
            return query;
        } },
    };
    context.window.supabase = context.supabase;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('js/data-requests.js', 'utf8'), context);
    context.GMDataRequests = context.window.GMDataRequests;
    vm.runInContext(fs.readFileSync('js/database.js', 'utf8'), context);
    return { context, reads };
}
const rows = n => Array.from({ length: n }, (_, id) => ({ id, date: '2026-10-07', class: id % 2 ? '1 Historical Class' : '2 Class', teacher_id: 't1', teacher: 'Guru', student: 'Siswa ' + id, status: 'hadir', note: 'Catatan' }));

test('identical in-flight reads share a request, settled reads refresh and identities remain isolated', async () => {
    const { context, reads } = fixture(rows(21));
    await Promise.all([context.getAttendancePage({ date: '2026-10-07' }), context.getAttendancePage({ date: '2026-10-07' })]);
    assert.equal(reads.length, 1);
    await context.getAttendancePage({ date: '2026-10-07' }); assert.equal(reads.length, 2);
    let finish, executions = 0;
    const work = () => { executions++; return new Promise(resolve => { finish = resolve; }); };
    const first = context.GMDataRequests.read('test', work); await Promise.resolve();
    context.window.AppAccess = { profile: { userId: 'another-user', role: 'guru', teacher_id: 't2' } };
    const second = context.GMDataRequests.read('test', async () => 2);
    assert.equal(await second, 2); finish(1); assert.equal(await first, 1); assert.equal(executions, 1);
    await assert.rejects(context.GMDataRequests.read('failure', async () => { throw Error('offline'); }));
    assert.equal(await context.GMDataRequests.read('failure', async () => 3), 3);
});

test('server log pagination downloads one page and returns the exact total', async () => {
    const { context, reads } = fixture(rows(35));
    const result = await context.getAttendancePage({ date: '2026-10-07' }, 3, 10);
    assert.equal(result.total, 35); assert.equal(result.rows.length, 10); assert.equal(result.rows[0].id, 20);
    assert.deepEqual(reads[0].range, [20, 29]); assert.equal(reads[0].count, 'exact');
    const full = await context.getAttendance({ date: '2026-10-07' }); assert.equal(full.length, 35);
});

test('level filtering preserves historical classes and downloads only selected full records', async () => {
    const { context, reads } = fixture(rows(1241));
    const result = await context.getAttendancePage({ date: '2026-10-07', level: '1' }, 2, 10);
    assert.equal(result.total, 620); assert.equal(result.rows.length, 10); assert.equal(result.rows[0].id, 21);
    assert.equal(reads.filter(read => read.columns === 'id,class').length, 3);
    assert.equal(reads.filter(read => read.columns.includes('note')).length, 1);
    const full = await context.getAttendance({ date: '2026-10-07', level: '1' }); assert.equal(full.length, 620);
});

test('teacher identity overrides caller filters for both paged and complete reads', async () => {
    const data = [...rows(8), { ...rows(1)[0], id: 100, teacher_id: 't2' }];
    const { context } = fixture(data);
    const access = { ready: Promise.resolve(), teacher: () => true, profile: { teacher_id: 't2' } };
    context.window.AppAccess = context.AppAccess = access;
    const result = await context.getAttendancePage({ teacher_id: 't1' }); assert.equal(result.total, 1); assert.equal(result.rows[0].id, 100);
    assert.equal((await context.getAttendance({ teacher_id: 't1' })).length, 1);
});
