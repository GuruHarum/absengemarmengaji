"use strict";
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(isMobile = false) {
    let document;
    function element() {
        const classes = new Set();
        return {
            attrs: {}, handlers: {}, inert: false,
            classList: { toggle(name, enabled) { if (enabled)
                    classes.add(name);
                else
                    classes.delete(name); }, contains: name => classes.has(name) },
            setAttribute(name, value) { this.attrs[name] = value; },
            addEventListener(name, handler) { this.handlers[name] = handler; },
            focus() { document.activeElement = this; },
            click() { this.handlers.click?.(); }
        };
    }
    const nodes = Object.fromEntries(['sidebar', 'adminMain', 'mobileMenuButton', 'toggleSidebar', 'mobileSidebarOverlay'].map(id => [id, element()]));
    const link = element();
    nodes.sidebar.querySelectorAll = selector => selector === 'a' ? [link] : [nodes.toggleSidebar, link];
    nodes.sidebar.contains = node => node === nodes.toggleSidebar || node === link;
    document = { body: element(), activeElement: null, handlers: {}, getElementById: id => nodes[id], addEventListener(name, handler) { this.handlers[name] = handler; } };
    const media = { matches: isMobile, addEventListener(name, handler) { this.change = handler; } };
    const window = { matchMedia: () => media };
    const ctx = vm.createContext({ window, document });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/sidebar.js'), 'utf8'), ctx);
    return { nodes, document, media, window, link };
}
test('desktop sidebar starts collapsed and hamburger expands then collapses it', () => {
    const { nodes, document } = setup();
    const trigger = nodes.mobileMenuButton;
    assert.equal(trigger.attrs['aria-expanded'], 'false');
    assert.equal(document.body.classList.contains('sidebar-collapsed'), true);
    trigger.click();
    assert.equal(trigger.attrs['aria-expanded'], 'true');
    assert.equal(document.body.classList.contains('sidebar-collapsed'), false);
    assert.equal(nodes.sidebar.inert, false);
    assert.equal(nodes.adminMain.inert, false);
    trigger.click();
    assert.equal(document.body.classList.contains('sidebar-collapsed'), true);
});
test('mobile drawer closes through close button, backdrop, Escape and navigation', () => {
    const { nodes, document, link, window } = setup(true);
    assert.equal(nodes.sidebar.inert, true);
    for (const close of [() => nodes.toggleSidebar.click(), () => nodes.mobileSidebarOverlay.click(), () => document.handlers.keydown({ key: 'Escape', preventDefault() { } }), () => link.click(), () => window.setMobileDrawer(false)]) {
        nodes.mobileMenuButton.click();
        assert.equal(document.body.classList.contains('drawer-open'), true);
        assert.equal(nodes.adminMain.inert, true);
        assert.equal(nodes.sidebar.inert, false);
        assert.equal(document.activeElement, nodes.toggleSidebar);
        close();
        assert.equal(nodes.adminMain.inert, false);
        assert.equal(nodes.sidebar.inert, true);
        assert.equal(nodes.mobileMenuButton.attrs['aria-expanded'], 'false');
        assert.equal(document.activeElement, nodes.mobileMenuButton);
    }
});
test('Tab stays inside the open drawer', () => {
    const { nodes, document, link } = setup(true);
    nodes.mobileMenuButton.click();
    document.handlers.keydown({ key: 'Tab', shiftKey: true, preventDefault() { } });
    assert.equal(document.activeElement, link);
    document.handlers.keydown({ key: 'Tab', shiftKey: false, preventDefault() { } });
    assert.equal(document.activeElement, nodes.toggleSidebar);
});
test('resizing clears mobile modal state and restores the desktop preference', () => {
    const { nodes, document, media } = setup();
    media.matches = true;
    media.change();
    assert.equal(nodes.sidebar.inert, true);
    assert.equal(document.body.classList.contains('sidebar-collapsed'), false);
    nodes.mobileMenuButton.click();
    media.matches = false;
    media.change();
    assert.equal(nodes.sidebar.inert, false);
    assert.equal(nodes.adminMain.inert, false);
    assert.equal(document.body.classList.contains('drawer-open'), false);
    assert.equal(document.body.classList.contains('sidebar-collapsed'), true);
    assert.equal(document.activeElement, nodes.mobileMenuButton);
});
