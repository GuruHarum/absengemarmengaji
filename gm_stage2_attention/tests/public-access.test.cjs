"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('public attendance does not contain or load the protected panel', () => {
    const html = read('index.html');
    for (const script of ['access', 'admin', 'dashboard', 'report', 'panel-start']) {
        assert.doesNotMatch(html, new RegExp(`src="js/${script}\\.js"`));
    }
    for (const id of ['page3', 'loginModal', 'reportContainer', 'adminDataList']) {
        assert.doesNotMatch(html, new RegExp(`id="${id}"`));
    }
    assert.match(read('admin.html'), /src="js\/access.js"/);
    assert.match(read('admin.html'), /src="js\/panel-start\.js(?:\?v=[^"]+)?"/);
});
test('public client neither consumes nor clears an existing panel session', () => {
    const authenticated = { auth: { session: 'teacher-session' } };
    const anonymous = {};
    let options;
    const ctx = vm.createContext({ SUPABASE_URL: 'url', SUPABASE_ANON_KEY: 'key', supabase: authenticated,
        supabaseClientFactory(url, key, config) { options = config; return anonymous; } });
    ctx.window = ctx;
    vm.runInContext(read('js/public-client.js'), ctx);
    assert.equal(ctx.panelAuthClient, authenticated);
    assert.equal(ctx.supabase, anonymous);
    assert.equal(options.auth.persistSession, false);
    assert.equal(options.auth.detectSessionInUrl, false);
    assert.equal(options.auth.autoRefreshToken, false);
    assert.equal(authenticated.auth.session, 'teacher-session');
});
test('public application loads teachers, students and today attendance without an account', async () => {
    const elements = {};
    const el = () => ({ innerHTML: '', textContent: '', dataset: {}, getAttribute: () => 'https://iili.io/FjF61ou.png', parentElement: {}, style: { setProperty() { } },
        classList: { add() { }, remove() { }, toggle() { } }, querySelectorAll: () => [], addEventListener() { } });
    const document = { getElementById: id => elements[id] ||= el(), querySelectorAll: () => [],
        addEventListener() { }, body: el(), documentElement: el() };
    const data = {
        teachers: [{ id: 1, nama: 'Guru A', foto: 'photo.png' }, { id: 2, nama: 'Guru Khusus Tahfidz', attendance_enabled: false }],
        students: [{ 'nama guru': 'Guru A', 'nama siswa': 'Ahmad', kelas: '1A' }],
        attendance: []
    };
    const calls = [];
    const ctx = vm.createContext({ document, console: { log() { }, error() { } },
        requestAnimationFrame: fn => fn(), setTimeout, resolveThemeColor: color => color || '#216454',
        supabase: { rpc(name) {
                if (name === 'gm_public_tahsin_teachers') return Promise.resolve({data:data.teachers.filter(x=>x.attendance_enabled!==false),error:null});
                if (name === 'gm_public_tahsin_students') return Promise.resolve({data:data.students,error:null});
                throw Error('Unexpected RPC: '+name);
            }, from(table) {
                calls.push(table);
                return { select() { return this; }, order() { return this; }, eq() { return this; },
                    range: async () => ({ data: data[table] || [], error: null }),
                    maybeSingle: async () => ({ data: table === 'school_profile' ? { name: 'Sekolah' } : { enabled: false }, error: null }) };
            } }, __gemarMengajiRealtimeChannel: true });
    ctx.window = ctx;
    for (const file of ['utils', 'ui', 'database', 'public-app'])
        vm.runInContext(read(`js/${file}.js`), ctx);
    await ctx.initApp();
    assert.match(elements.teacherGrid.innerHTML, /Guru A/);
    assert.doesNotMatch(elements.teacherGrid.innerHTML, /Guru Khusus Tahfidz/);
    assert.equal(vm.runInContext('studentsData.length', ctx), 1);
    assert.equal(calls.includes('user_roles'), false);
    assert.equal(ctx.AppAccess, undefined);
    vm.runInContext("selectedTeacher = 'Guru A'; selectedClass = '1';", ctx);
    await ctx.renderStudents();
    assert.match(elements.studentList.innerHTML, /Ahmad/);
    assert.match(elements.studentList.innerHTML, /data-status="hadir"/);
});
