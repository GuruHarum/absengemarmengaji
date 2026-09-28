"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
async function setup() {
    const elements = {};
    const node = () => ({ dataset: {}, value: '', innerHTML: '', textContent: '', handlers: {}, disabled: false,
        addEventListener(event, cb) { this.handlers[event] = cb; }, querySelectorAll: () => [],
        replaceChildren() { this.value = ''; }, add() { }, reportValidity: () => true });
    const document = { handlers: {}, getElementById: id => elements[id] ||= node(), addEventListener(event, cb) { this.handlers[event] = cb; } };
    const students = [{ id: 1, 'nama siswa': 'Ahmad', 'nama guru': 'A', kelas: '4A' }, { id: 2, 'nama siswa': 'Bilal', 'nama guru': 'A', kelas: '4B' }, { id: 3, 'nama siswa': 'Hasan', 'nama guru': 'B', kelas: '4A' }];
    const calls = [];
    let fail = false;
    const ctx = vm.createContext({ document, confirm: () => true, AppAccess: { full: () => true },
        Option: function (text, value) { this.value = value; }, getTeachers: async () => [{ id: 1, nama: 'A' }, { id: 2, nama: 'B' }, { id: 3, nama: 'C', attendance_enabled: false }], getStudents: async () => students,
        fetchAllRows: async () => [], supabase: { rpc: async (name, args) => { calls.push({ name, args }); return { error: fail ? new Error('Siswa sudah ditugaskan') : null }; } } });
    ctx.window = ctx;
    for (const file of ['utils', 'assignments'])
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file + '.js'), 'utf8'), ctx);
    document.handlers.panelready();
    document.getElementById('assessmentYear').value = '2026';
    await ctx.TeachingAssignments.open();
    function choose(teacher, kelas = 'level:4') { elements.assignmentTeacher.value = teacher; document.getElementById('assignmentMemberMode').value = 'tahsin'; elements.assignmentMemberMode.handlers.change(); elements.assignmentTahsinClass.value = kelas; elements.assignmentTahsinClass.handlers.change(); }
    return { elements, students, calls, choose, fail: value => fail = value, save: () => elements.assignmentForm.handlers.submit({ preventDefault() { } }) };
}
test('same-as-Tahsin saves only the selected class and teacher', async () => {
    const app = await setup();
    app.choose('1', '4A');
    assert.match(app.elements.assignmentSelected.textContent, /1 siswa/);
    await app.save();
    assert.equal(app.calls[0].args.teacher_key, '1');
    assert.deepEqual(Array.from(app.calls[0].args.student_keys), ['1']);
});
test('changing teacher replaces selection; a Tahfidz-only teacher has no automatic pupils', async () => {
    const app = await setup();
    app.choose('1');
    app.choose('2');
    await app.save();
    assert.deepEqual(Array.from(app.calls[0].args.student_keys), ['3']);
    app.choose('3');
    await app.save();
    assert.equal(app.calls.length, 1);
    assert.match(app.elements.assignmentFeedback.textContent, /belum memiliki siswa Tahsin/);
});
test('master roster changes require reviewing refreshed selection and failed saves retain selection', async () => {
    const app = await setup();
    app.choose('1');
    app.students.push({ id: 4, 'nama siswa': 'Dani', 'nama guru': 'A', kelas: '4C' });
    await app.save();
    assert.equal(app.calls.length, 0);
    assert.match(app.elements.assignmentSelected.textContent, /3 siswa/);
    app.fail(true);
    await app.save();
    assert.match(app.elements.assignmentSelected.textContent, /3 siswa/);
    assert.equal(app.elements.assignmentMemberMode.value, 'tahsin');
    app.fail(false);
    await app.save();
    assert.deepEqual(Array.from(app.calls[1].args.student_keys), ['1', '2', '4']);
});
test('level selection excludes other levels, changing class replaces selected pupils, and blank scope cannot save', async () => {
    const app = await setup();
    app.students.push({ id: 5, 'nama siswa': 'Eka', 'nama guru': 'A', kelas: '5A' });
    app.choose('1', 'level:4');
    await app.save();
    assert.deepEqual(Array.from(app.calls[0].args.student_keys), ['1', '2']);
    app.choose('1', '4B');
    await app.save();
    assert.deepEqual(Array.from(app.calls[1].args.student_keys), ['2']);
    app.choose('1', '');
    await app.save();
    assert.equal(app.calls.length, 2);
    assert.match(app.elements.assignmentFeedback.textContent, /Pilih kelas/);
});
test('one teacher can include multiple selected classes without duplicate students', async () => {
    const app = await setup();
    app.students.push({ id: 5, 'nama siswa': 'Eka', 'nama guru': 'A', kelas: '5A' });
    app.choose('1', '4A');
    app.elements.assignmentTahsinClass.selectedOptions = [{ value: 'level:4' }, { value: '4A' }, { value: '5A' }];
    app.elements.assignmentTahsinClass.handlers.change();
    await app.save();
    assert.deepEqual(Array.from(app.calls[0].args.student_keys), ['1', '2', '5']);
    assert.equal(app.calls[0].args.teacher_key, '1');
});
test('automatic group name uses teacher display name and distinct numeric levels', async () => {
    const app = await setup();
    app.choose('1', 'level:4');
    await app.save();
    assert.equal(app.calls[0].args.group_name, 'Tahfidz A Kelas 4');
    app.students.push({ id: 5, 'nama siswa': 'Eka', 'nama guru': 'A', kelas: '5A' });
    app.choose('1', '4A');
    app.elements.assignmentTahsinClass.selectedOptions = [{ value: 'level:4' }, { value: '5A' }];
    app.elements.assignmentTahsinClass.handlers.change();
    await app.save();
    assert.equal(app.calls[1].args.group_name, 'Tahfidz A Kelas 4, 5');
});
test('same-as-Tahsin mode previews teacher pupils before choosing a class without selecting them', async () => {
    const app = await setup();
    app.choose('1', '');
    assert.match(app.elements.assignmentStudents.innerHTML, /Ahmad/);
    assert.match(app.elements.assignmentStudents.innerHTML, /Bilal/);
    assert.doesNotMatch(app.elements.assignmentStudents.innerHTML, /Hasan/);
    await app.save();
    assert.equal(app.calls.length, 0);
});
