"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const load = (mock = {}) => {
    const events = { uploads: [], updates: [], removals: [] };
    const bucket = {
        upload: async (path, file) => { events.uploads.push({ path, file }); return { error: mock.uploadError || null }; },
        getPublicUrl: path => ({ data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/teachers/${path}` } }),
        remove: async (paths) => { events.removals.push(paths); return { error: null }; }
    };
    const supabase = {
        storage: { from: name => { assert.equal(name, 'teachers'); return bucket; } },
        from: name => {
            assert.equal(name, 'teachers');
            const req = { update(payload) { events.updates.push(payload); return this; }, eq() { return this; }, select() { return this; },
                async single() { return mock.dbError ? { data: null, error: mock.dbError } : { data: { id: 10, attendance_enabled: true, ...events.updates.at(-1) }, error: null }; } };
            return req;
        }
    };
    const ctx = vm.createContext({ supabase, crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' }, console });
    ctx.window = ctx;
    vm.runInContext(fs.readFileSync('js/teacher-photo.js', 'utf8'), ctx);
    return { app: ctx.TeacherPhoto, events };
};
const image = (size = 12000, type = 'image/jpeg') => ({ size, type, name: 'portrait.jpg' });
test('foto Tahsin diunggah sebagai berkas Supabase dan referensinya tersimpan pada teachers', async () => {
    const { app, events } = load();
    const teacher = { id: 10, attendance_enabled: true, foto: 'https://foto-lama.example/a.jpg', foto_storage_path: null };
    const saved = await app.save(teacher, image());
    assert.equal(events.uploads.length, 1);
    assert.match(events.uploads[0].path, /^portraits\/10\/[0-9a-f-]+\.jpg$/);
    assert.equal(events.updates[0].foto_storage_path, events.uploads[0].path);
    assert.match(events.updates[0].foto, /^https:\/\/test.supabase.co\/storage\/v1\/object\/public\/teachers\/portraits\/10\//);
    assert.equal(saved.foto, events.updates[0].foto);
    assert.equal(events.removals.length, 0);
});
test('guru khusus Tahfidz tidak boleh mempunyai unggahan foto baru', async () => {
    const { app, events } = load();
    await assert.rejects(app.save({ id: 10, attendance_enabled: false }, image()), /guru Tahsin/);
    assert.equal(events.uploads.length, 0);
});
test('validasi foto menolak file lebih dari 2 MB dan jenis selain gambar yang diizinkan', () => {
    const { app } = load();
    assert.throws(() => app.validate(image(2 * 1024 * 1024 + 1)), /2 MB/);
    assert.throws(() => app.validate(image(200, 'image/svg+xml')), /JPG, PNG atau WebP/);
    assert.equal(app.validate(image(12000, 'image/png')), 'png');
});
test('kegagalan database menghapus foto yang baru diunggah agar tidak yatim', async () => {
    const { app, events } = load({ dbError: new Error('migration missing') });
    await assert.rejects(app.save({ id: 10, attendance_enabled: true }, image()), /migration missing/);
    assert.equal(events.removals.length, 1);
    assert.deepEqual(Array.from(events.removals[0]), [events.uploads[0].path]);
});
test('penggantian dan penghapusan foto hanya membersihkan objek lama di folder guru bersangkutan', async () => {
    const { app, events } = load();
    const teacher = { id: 10, attendance_enabled: true, foto_storage_path: 'portraits/10/old.jpg' };
    await app.save(teacher, image());
    assert.deepEqual(Array.from(events.removals[0]), ['portraits/10/old.jpg']);
    await app.remove(teacher);
    assert.equal(events.updates.at(-1).foto, null);
    assert.equal(events.updates.at(-1).foto_storage_path, null);
});
test('form catatan manual tidak muncul dan PDF menggunakan catatan otomatis Excel', () => {
    const form = fs.readFileSync('js/progress-form.js', 'utf8');
    const pdf = fs.readFileSync('js/report-pdf.js', 'utf8');
    assert.doesNotMatch(form, /Catatan tambahan guru/);
    assert.doesNotMatch(form, /<textarea/);
    assert.doesNotMatch(pdf, /teacher_note/);
    const core = fs.readFileSync('js/report-core.js', 'utf8');
    assert.match(core, /dapat mengikuti KBM tahsin dan tahfidz di/);
    assert.match(core, /Kualitas dan pencapaian bacaan serta hafalan/);
});
test('foto guru Tahsin berasal dari database dan perubahan foto dipusatkan di Pengaturan Profil', () => {
    const ui = fs.readFileSync('js/ui.js', 'utf8');
    const dashboard = fs.readFileSync('js/dashboard.js', 'utf8');
    const admin = fs.readFileSync('admin.html', 'utf8');
    const profile = fs.readFileSync('js/profile.js', 'utf8');
    assert.match(ui, /teacher\.foto/);
    assert.doesNotMatch(dashboard, /inputGuruFotoFile/);
    assert.match(admin, /id="profilePhotoFile"/);
    assert.match(profile, /TeacherPhoto\.save/);
    assert.match(profile, /TeacherPhoto\.remove/);
});
