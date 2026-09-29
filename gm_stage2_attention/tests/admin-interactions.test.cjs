"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(file) {
    let document;
    function node(tag = 'div') {
        return { tag, children: [], attrs: {}, handlers: {}, textContent: '', hidden: false, isConnected: true,
            setAttribute(k, v) { this.attrs[k] = v; }, append(...items) { items.forEach(item => { item.parent = this; this.children.push(item); }); },
            replaceChildren() { this.children = []; }, addEventListener(e, fn) { this.handlers[e] = fn; }, dispatchEvent(e) { this.handlers[e.type]?.(e); },
            focus() { document.activeElement = this; }, remove() { this.parent.children = this.parent.children.filter(x => x !== this); },
            contains(target) { return this === target || this.children.some(c => c.contains(target)); },
            get firstElementChild() { return this.children[0]; }, querySelector(selector) { this.lookups ||= {}; return this.lookups[selector] ||= node('button'); },
            querySelectorAll(selector) { const all = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]); return selector === 'input' ? all.filter(c => c.tag === 'input') : all; },
            after(item) { this.sibling = item; }, showModal() { this.open = true; }, close() { this.open = false; } };
    }
    const elements = {};
    document = { handlers: {}, activeElement: node(), body: node(), createElement: node, getElementById: id => elements[id] ||= node(), addEventListener(e, fn) { this.handlers[e] = fn; }, querySelectorAll: () => [] };
    const timers = [];
    const ctx = vm.createContext({ document, MutationObserver: class {
            observe() { }
        }, Event: class {
            constructor(type) { this.type = type; }
        }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() { } });
    ctx.window = ctx;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), ctx);
    return { ctx, document, elements, node, timers };
}
test('confirmation defaults to cancel, resolves buttons and Escape, and restores focus', async () => {
    const { ctx, document } = setup('admin-notices.js');
    const original = document.activeElement;
    let request = ctx.AdminNotice.confirm('Hapus siswa?');
    const dialog = document.body.children[0];
    assert.equal(document.activeElement, dialog.querySelector('[data-cancel]'));
    dialog.querySelector('[data-cancel]').onclick();
    assert.equal(await request, false);
    assert.equal(document.activeElement, original);
    request = ctx.AdminNotice.confirm('Lanjut?');
    dialog.querySelector('[data-accept]').onclick();
    assert.equal(await request, true);
    request = ctx.AdminNotice.confirm('Lanjut?');
    dialog.handlers.cancel({ preventDefault() { } });
    assert.equal(await request, false);
});
test('notifications keep untrusted text as text and can be closed', () => {
    const { ctx, document, timers } = setup('admin-notices.js');
    ctx.AdminNotice.notify('<img onerror=bad()>', 'error');
    const toast = document.body.children[0].children[0];
    assert.equal(toast.attrs.role, 'alert');
    assert.equal(toast.children[1].children[1].textContent, '<img onerror=bad()>');
    toast.children[2].onclick();
    timers.filter(t => t.ms === 250).forEach(t => t.fn());
    assert.equal(document.body.children[0].children.length, 0);
});
test('class dropdown keeps focus and checkbox nodes while selecting multiple options', () => {
    const { ctx, document } = setup('class-picker.js');
    const source = document.getElementById('assignmentTahsinClass');
    source.options = [{ value: '4A', textContent: '4A', selected: false }, { value: '4B', textContent: '4B', selected: false }];
    source.handlers.change = () => ctx.ClassPicker.refresh();
    document.handlers.panelready();
    const wrapper = source.sibling;
    const [trigger, popup] = wrapper.children;
    trigger.handlers.click();
    source.options = source.options.map(option => ({ ...option }));
    ctx.ClassPicker.refresh();
    const first = popup.children[0].children[0];
    first.focus();
    first.checked = true;
    first.handlers.change();
    assert.equal(source.options[0].selected, true);
    assert.equal(popup.children[0].children[0], first);
    assert.equal(document.activeElement, first);
    assert.equal(popup.hidden, false);
    const second = popup.children[1].children[0];
    second.checked = true;
    second.handlers.change();
    assert.equal(trigger.textContent, '4A, 4B');
    wrapper.handlers.keydown({ key: 'Escape', preventDefault() { } });
    assert.equal(popup.hidden, true);
    assert.equal(document.activeElement, trigger);
});
test('login offers neither Google OAuth nor self-registration', () => {
    const html = fs.readFileSync(path.join(__dirname, '../login.html'), 'utf8');
    assert.doesNotMatch(html, /googleLogin|login-google|auth-options|signUp|signInWithOAuth/);
});
