"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function setup(reduce = false) {
    const nodes = {};
    let tick = null;
    const document = { hidden: false, activeElement: null, handlers: {}, addEventListener(k, fn) { this.handlers[k] = fn; }, getElementById(id) {
            return nodes[id] ||= { textContent: '', handlers: {}, attrs: {}, contains: () => false, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(k, fn) { this.handlers[k] = fn; } };
        } };
    const ctx = vm.createContext({ document, window: { matchMedia: () => ({ matches: reduce, addEventListener() { } }) }, clearInterval: () => { tick = null; }, setInterval: fn => { tick = fn; return 1; }, setTimeout: fn => fn() });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/maintenance.js'), 'utf8'), ctx);
    return { nodes, document, getTick: () => tick };
}
test('16 reflections cycle automatically and wrap in either direction', () => {
    const { nodes, getTick } = setup();
    const first = nodes.quoteText.textContent;
    getTick()();
    assert.equal(nodes.quoteCounter.textContent, '02 / 16');
    for (let n = 0; n < 15; n++)
        getTick()();
    assert.equal(nodes.quoteText.textContent, first);
    nodes.quotePrev.handlers.click();
    assert.equal(nodes.quoteCounter.textContent, '16 / 16');
    nodes.quoteNext.handlers.click();
    assert.equal(nodes.quoteCounter.textContent, '01 / 16');
});
test('rotation pauses manually, on hover, in hidden tabs and for reduced motion', () => {
    const { nodes, document, getTick } = setup();
    nodes.quotePause.handlers.click();
    assert.equal(getTick(), null);
    nodes.quotePause.handlers.click();
    assert.equal(typeof getTick(), 'function');
    nodes.quoteCarousel.handlers.mouseenter();
    assert.equal(getTick(), null);
    nodes.quoteCarousel.handlers.mouseleave();
    assert.equal(typeof getTick(), 'function');
    document.hidden = true;
    document.handlers.visibilitychange();
    assert.equal(getTick(), null);
    document.hidden = false;
    document.handlers.visibilitychange();
    assert.equal(typeof getTick(), 'function');
    assert.equal(setup(true).getTick(), null);
});
