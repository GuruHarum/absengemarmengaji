"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
async function setup(classes, subject = 'tahfidz', savedRows = [], fullAccess = true) {
    const elements = {};
    const node = () => ({ value: '', innerHTML: '', textContent: '', hidden: true, disabled: false, handlers: {},
        classList: { toggle() { } }, querySelectorAll: () => [], querySelector: () => null,
        addEventListener(event, callback) { this.handlers[event] = callback; },
        replaceChildren() { this.value = ''; }, add() { }, reportValidity: () => true });
    const document = { handlers: {}, getElementById: id => elements[id] ||= node(), addEventListener(event, cb) { this.handlers[event] = cb; } };
    const students = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, 'nama siswa': `Siswa ${i}`, 'nama guru': 'Guru A', kelas: i === 8 ? '2A' : '1A' }));
    if (classes)
        students.forEach((student, index) => { student.kelas = classes[index] || '3A'; });
    const calls = [];
    let fail = false;
    const ctx = vm.createContext({ document, console, confirm: () => true,
        AppAccess: { ready: Promise.resolve(), full: () => fullAccess, profile: { teacher_id: 't1' } },
        getTeachers: async () => [{ id: 't1', nama: 'Guru A' }],
        Option: function (text, value) { this.text = text; this.value = value; },
        supabase: { from(table) { return { table, select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; } }; },
            rpc(name, args) {
                if (name === 'assessment_roster')
                    return { table: 'students' };
                calls.push({ name, args });
                return Promise.resolve(fail ? { error: new Error('Offline'), data: null } : { error: null, data: args.entries.map(row => ({ ...row, version: row.version + 1 })) });
            } },
        fetchAllRows: async (factory) => { const q = factory(); return q.table === 'students' ? students : q.table === 'teaching_assignments' ? [{ teacher_id:'t1' }] : savedRows; },
        addEventListener() { }
    });
    ctx.window = ctx;
    for (const file of ['utils', 'quran-surahs', 'surah-picker', 'assessments-core', 'assessments'])
        vm.runInContext(read(`js/${file}.js`), ctx);
    ctx.SurahPicker.bind = () => { };
    document.handlers.panelready();
    await ctx.PeriodicAssessments.open();
    document.getElementById('assessmentSubject').value = subject;
    elements.assessmentYear.value = '2026';
    elements.assessmentPeriod.value = 'pts_ganjil';
    await elements.assessmentLoadForm.handlers.submit({ preventDefault() { } });
    function edit(index, field, value) {
        const ayah = { innerHTML: '' };
        elements.assessmentCards.handlers.input({ target: { value, dataset: { field }, closest: () => ({ dataset: { studentIndex: index }, querySelector: () => ayah }) } });
        return ayah;
    }
    function fill(index) {
        const values = { tahsin_makhraj: '80', tahsin_tajwid: '80', tahsin_tartil: '80', tahsin_book: '4', tahsin_page: '12', tahfidz_makhraj: '85', tahfidz_tajwid: '85', tahfidz_hafalan: '85', tahfidz_surah: '1', tahfidz_ayah: '7' };
        for (const [field, value] of Object.entries(values))
            if (field.startsWith(subject + '_'))
                edit(index, field, value);
    }
    return { elements, calls, edit, fill, fail: value => { fail = value; } };
}
test('Save All only sends dirty students in ONE selected class and preserves drafts outside that class', async () => {
    const app = await setup();
    for (let i = 0; i < 9; i++)
        app.fill(i);
    app.elements.assessmentClass.value = '2A';
    app.elements.assessmentClass.handlers.input();
    app.fail(true);
    await app.elements.assessmentSaveAll.handlers.click();
    assert.equal(app.calls[0].args.entries.length, 1);
    assert.equal(app.calls[0].args.entries[0].student_id, 's8');
    assert.equal(app.elements.assessmentDirty.textContent, 1);
    assert.equal(app.elements.assessmentSaved.textContent, 0);
    app.fail(false);
    await app.elements.assessmentSaveAll.handlers.click();
    assert.equal(app.elements.assessmentDirty.textContent, 0);
    assert.equal(app.elements.assessmentSaved.textContent, 1);
    assert.equal(app.calls[1].args.entries.every(row => row.period === 'pts_ganjil' && row.academic_year_start === 2026), true);
});
test('one selected physical class never merges students from sibling classes', async () => {
    const app = await setup(['2', '2A', '2 B', 'Kelas 2C', '12A', '1A']);
    for (const [cls,id] of [['2',0],['2A',1],['2 B',2],['Kelas 2C',3],['12A',4]]) {
        app.elements.assessmentClass.value = cls; app.elements.assessmentClass.handlers.input();
        const html = app.elements.assessmentCards.innerHTML;
        assert.match(html,new RegExp(`Siswa ${id}`));
        for(let n=0;n<6;n++) if(n!==id) assert.doesNotMatch(html,new RegExp(`Siswa ${n}`));
        assert.equal(app.elements.assessmentTotal.textContent,1);
    }
});
test('an incomplete row prevents the entire batch; per-student save sends only that student', async () => {
    const app = await setup();
    app.fill(0);
    app.fill(1);
    app.edit(1, 'tahfidz_hafalan', '');
    await app.elements.assessmentSaveAll.handlers.click();
    assert.equal(app.calls.length, 0);
    assert.match(app.elements.assessmentFeedback.textContent, /TARTIL \/ KELANCARAN/);
    await app.elements.assessmentCards.handlers.submit({ preventDefault() { }, target: { dataset: { studentIndex: '0' } } });
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0].args.entries.length, 1);
    assert.equal(app.calls[0].args.entries[0].student_id, 's0');
    assert.equal(app.elements.assessmentDirty.textContent, 7);
});
test('changing surah resets the previous verse and provides the new valid range', async () => {
    const app = await setup();
    app.fill(0);
    const ayah = app.edit(0, 'tahfidz_surah', '108');
    assert.match(ayah.innerHTML, /Ayat 3/);
    assert.doesNotMatch(ayah.innerHTML, /Ayat 4/);
    await app.elements.assessmentSaveAll.handlers.click();
    assert.equal(app.calls.length, 0);
    assert.match(app.elements.assessmentFeedback.textContent, /ayat/);
});
test('Tahsin can be saved with no Tahfidz fields and vice versa', async () => {
    for (const subject of ['tahsin', 'tahfidz']) {
        const app = await setup(undefined, subject);
        app.fill(0);
        await app.elements.assessmentSaveAll.handlers.click();
        assert.equal(app.calls.length, 1);
        assert.equal(app.calls[0].name, 'save_subject_assessments');
        const row = app.calls[0].args.entries[0];
        assert.equal(row.subject, subject);
        const other = subject === 'tahsin' ? 'tahfidz' : 'tahsin';
        assert.equal(Object.keys(row).some(key => key.startsWith(other + '_')), false);
        assert.doesNotMatch(app.elements.assessmentCards.innerHTML, new RegExp(`data-subject="${other}"`));
        assert.equal(app.elements.assessmentDirty.textContent, 7);
    }
});
test('legacy Tahfidz scores remain visible and manager can verify an unchanged row', async () => {
    const app = await setup(undefined, 'tahfidz', [{ student_id: 's0', version: 3, needs_review: true, scores: { tahfidz_makhraj: 82, tahfidz_tajwid: 83, tahfidz_hafalan: 84, tahfidz_surah: 1, tahfidz_ayah: 7 } }]);
    assert.match(app.elements.assessmentCards.innerHTML, /Verifikasi & Simpan/);
    assert.match(app.elements.assessmentCards.innerHTML, /value="82"/);
    await app.elements.assessmentCards.handlers.submit({ preventDefault() { }, target: { dataset: { studentIndex: '0' } } });
    assert.equal(app.calls[0].args.entries[0].version, 3);
    assert.equal(app.calls[0].args.entries[0].tahfidz_makhraj, 82);
});
test('teacher cannot edit legacy scores awaiting manager verification', async () => {
    const app = await setup(undefined, 'tahfidz', [{ student_id: 's0', version: 1, needs_review: true, scores: {} }], false);
    assert.match(app.elements.assessmentCards.innerHTML, /data-review-locked="true"/);
    assert.match(app.elements.assessmentCards.innerHTML, /<fieldset disabled/);
    assert.match(app.elements.assessmentCards.innerHTML, /type="submit" disabled/);
    assert.doesNotMatch(app.elements.assessmentCards.innerHTML, /Verifikasi & Simpan/);
});
test('level selector chooses one real class rather than combining letter classes', async () => {
    const app = await setup(['4A', '4B', '5A', '14A']);
    app.elements.assessmentLevel.value = '4';
    app.elements.assessmentLevel.handlers.input();
    assert.match(app.elements.assessmentCards.innerHTML, /Siswa 0/);
    assert.doesNotMatch(app.elements.assessmentCards.innerHTML, /Siswa 1/);
    assert.doesNotMatch(app.elements.assessmentCards.innerHTML, /Siswa [2345678]/);
});
test('all pupils of a single level appear together instead of being cut at eight', async () => {
    const app = await setup(Array(9).fill('4A'));
    assert.match(app.elements.assessmentCards.innerHTML, /Siswa 8/);
    assert.equal(app.elements.assessmentPageInfo.textContent, '4 A');
    assert.equal(app.elements.assessmentTotal.textContent, 9);
});
test('one surah field selects Indonesian suggestions directly and resets the verse', async () => {
    const app = await setup();
    app.fill(0);
    const ayah = { innerHTML: '' };
    let validity = '';
    const search = value => app.elements.assessmentCards.handlers.input({ target: { value, setCustomValidity: value => { validity = value; }, dataset: { surahSearch: 'true', surahCommit: 'true' }, closest: () => ({ dataset: { studentIndex: '0' }, querySelector: () => ayah }) } });
    assert.match(app.elements.assessmentCards.innerHTML, /role="combobox"/);
    assert.match(app.elements.assessmentCards.innerHTML, />Simpan Nilai</);
    assert.doesNotMatch(app.elements.assessmentCards.innerHTML, /<select[^>]+data-field="tahfidz_surah"/);
    search('111. Al-Lahab');
    assert.equal(validity, '');
    assert.match(ayah.innerHTML, /Ayat 5/);
    assert.doesNotMatch(ayah.innerHTML, /Ayat 6/);
    app.edit(0, 'tahfidz_ayah', '5');
    await app.elements.assessmentCards.handlers.submit({ preventDefault() { }, target: { dataset: { studentIndex: '0' } } });
    assert.equal(app.calls[0].args.entries[0].tahfidz_surah, 111);
    search('surat tidak ada');
    assert.match(validity, /Pilih nama/);
    await app.elements.assessmentSaveAll.handlers.click();
    assert.equal(app.calls.length, 1);
    search('108');
    assert.equal(validity, '');
    assert.match(ayah.innerHTML, /Ayat 3/);
    assert.doesNotMatch(ayah.innerHTML, /Ayat 4/);
});
test('compact legacy Tahfidz class displays spaces and retains its filter identity', async () => {
    const app = await setup(['1UTSMANBINAFFAN', '1 Umar Bin Khattab']);
    app.elements.assessmentClass.value = '1UTSMANBINAFFAN'; app.elements.assessmentClass.handlers.input();
    assert.ok(app.elements.assessmentCards.innerHTML.includes('<p>1 Utsman Bin Affan</p>'));
    app.elements.assessmentClass.value = '1UTSMANBINAFFAN';
    app.elements.assessmentClass.handlers.input();
    assert.ok(app.elements.assessmentCards.innerHTML.includes('1 Utsman Bin Affan'));
    assert.ok(!app.elements.assessmentCards.innerHTML.includes('Siswa 1</h3>'));
});
test('every known class restores word spacing in both assessment subjects', async () => {
    const names = JSON.parse(read('js/assessments.js').match(/const legacyClassNames = (\[[^;]+\]);/)[1]);
    for (const subject of ['tahsin', 'tahfidz']) {
        for (let start = 0; start < names.length; start += 9) {
            const batch = names.slice(start, start + 9);
            const app = await setup(batch.map(name => '1' + name.replace(/\s/g, '').toUpperCase()), subject);
            for (const name of batch) {
                app.elements.assessmentClass.value='1'+name.replace(/\s/g,'').toUpperCase();
                app.elements.assessmentClass.handlers.input();
                assert.ok(app.elements.assessmentCards.innerHTML.includes('<p>1 ' + name.replaceAll("'", '&#39;') + '</p>'), subject + ': ' + name);
                assert.equal(app.elements.assessmentTotal.textContent,1);
            }
        }
    }
});
test('class labels normalize prefixes, Roman levels and mixed case', async () => {
    for (const [input, expected] of [['kelas I UMAR BIN KHATTAB', '1 Umar Bin Khattab'], ['2   aLi BIN ABI THALIB', '2 Ali Bin Abi Thalib'], ['3b', '3 B']]) {
        const app = await setup(Array(9).fill(input));
        assert.ok(app.elements.assessmentCards.innerHTML.includes('<p>' + expected + '</p>'));
    }
});
