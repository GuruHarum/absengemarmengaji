"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
    const handlers = {}, docHandlers = {}, attrs = {};
    let chosen = '';
    const list = { hidden: true, innerHTML: '', querySelectorAll: () => options };
    const box = { querySelector: selector => selector === 'input' ? input : list, contains: target => target === input || options.includes(target) };
    const input = { id: 'surah', value: '', dataset: { surahSearch: 'true' }, disabled: false, closest: selector => selector === '.surah-picker' ? box : null, setAttribute: (key, value) => attrs[key] = value, getAttribute: key => attrs[key], removeAttribute: key => delete attrs[key], focus() { }, dispatchEvent() { chosen = this.value; } };
    const options = [111, 112].map(number => ({ id: 'surah-option-' + number, dataset: { surahNumber: String(number) }, setAttribute() { }, scrollIntoView() { }, closest: selector => selector === '[data-surah-number]' ? options.find(option => option.dataset.surahNumber === String(number)) : box }));
    const root = { addEventListener: (event, callback) => handlers[event] = callback, querySelectorAll: () => [box] };
    const context = vm.createContext({ Event, document: { addEventListener: (event, callback) => docHandlers[event] = callback } });
    context.window = context;
    for (const file of ['utils', 'quran-surahs', 'surah-picker'])
        vm.runInContext(fs.readFileSync('js/' + file + '.js', 'utf8'), context);
    context.SurahPicker.bind(root);
    return { context, handlers, docHandlers, input, list, options, attrs, chosen: () => chosen };
}
test('Indonesian surah results match names, punctuation and numbers with escaped markup', () => {
    const app = setup();
    assert.equal(app.context.SurahPicker.search('lahab')[0].number, 111);
    assert.equal(app.context.SurahPicker.search('al ikhlas')[0].number, 112);
    assert.equal(app.context.SurahPicker.search('108')[0].name, 'Al-Kausar');
    assert.match(app.context.SurahPicker.markup('p1', 111, '<Ali>'), /&lt;Ali&gt;/);
    app.input.value = 'lahab';
    app.handlers.input({ target: app.input });
    assert.match(app.list.innerHTML, /Al-Lahab/);
    assert.match(app.list.innerHTML, /5 ayat/);
    assert.doesNotMatch(app.list.innerHTML, /Al-Baqarah/);
});
test('picker supports arrow navigation, Enter selection, Escape and click selection', () => {
    const app = setup();
    const key = key => app.handlers.keydown({ target: app.input, key, preventDefault() { } });
    app.handlers.focusin({ target: app.input });
    assert.equal(app.list.hidden, false);
    key('ArrowDown');
    assert.equal(app.attrs['aria-activedescendant'], 'surah-option-111');
    key('ArrowDown');
    assert.equal(app.attrs['aria-activedescendant'], 'surah-option-112');
    key('Enter');
    assert.equal(app.chosen(), '112. Al-Ikhlas');
    assert.equal(app.list.hidden, true);
    app.handlers.focusin({ target: app.input });
    key('Escape');
    assert.equal(app.attrs['aria-expanded'], 'false');
    app.handlers.click({ target: app.options[0] });
    assert.equal(app.chosen(), '111. Al-Lahab');
    app.handlers.focusin({ target: app.input });
    app.docHandlers.pointerdown({ target: {} });
    assert.equal(app.list.hidden, true);
});
