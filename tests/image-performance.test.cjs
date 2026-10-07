'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const vm = require('node:vm');
const { optimizeImages } = require('../scripts/optimize-images.cjs');
const { stampPwaCache } = require('../scripts/stamp-pwa-cache.cjs');

test('logo/icon PNG compression preserves all pixels and transparency; web logo is separate', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-images-'));
    try {
        fs.cpSync('assets', path.join(out, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(out, 'sw.js'), "const VERSION = 'test'; const PRECACHE = [];");
        fs.writeFileSync(path.join(out, 'admin.html'), '<html><head></head><body><img src="assets/school-logo.png"></body></html>');
        const result = await optimizeImages(out); assert.ok(result.webLogoBytes < fs.statSync('assets/school-logo.png').size);
        for (const name of fs.readdirSync('assets').filter(name => name.endsWith('.png'))) {
            const before = await sharp(fs.readFileSync(path.join('assets', name))).ensureAlpha().raw().toBuffer();
            const after = await sharp(fs.readFileSync(path.join(out, 'assets', name))).ensureAlpha().raw().toBuffer();
            assert.deepEqual(after, before, name);
        }
        const web = fs.readdirSync(path.join(out, 'assets')).find(name => name.startsWith('school-logo-web-'));
        const meta = await sharp(fs.readFileSync(path.join(out, 'assets', web))).metadata();
        assert.ok(meta.width <= 192 && meta.height <= 192); assert.ok(meta.hasAlpha);
        const first = stampPwaCache(out); assert.equal(stampPwaCache(out), first);
        fs.appendFileSync(path.join(out, 'admin.html'), '<!-- changed -->');
        assert.notEqual(stampPwaCache(out), first);
        assert.ok(fs.existsSync(path.join(out, 'assets/school-logo.png')));
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
});

test('new portraits are resized proportionally and use the smaller WebP; failures retain original', async () => {
    const drawn = [], dimensions = [], closed = [];
    const context = { File, Blob, window: {}, document: { createElement() {
        return { getContext() { return { drawImage(...args) { drawn.push(args); } }; }, toBlob(resolve, type) { dimensions.push([this.width, this.height]); resolve(new Blob(['small'], { type })); } };
    } }, createImageBitmap: async () => ({ width: 1600, height: 800, close() { closed.push(true); } }) };
    vm.createContext(context); vm.runInContext(fs.readFileSync('js/teacher-photo.js', 'utf8'), context);
    const original = new File(['a'.repeat(100)], 'teacher.png', { type: 'image/png' });
    const optimized = await context.window.TeacherPhoto.optimize(original);
    assert.equal(optimized.type, 'image/webp'); assert.ok(optimized.size < original.size);
    assert.deepEqual(dimensions[0], [768, 384]); assert.equal(closed.length, 1);
    context.createImageBitmap = async () => { throw Error('unsupported'); };
    assert.equal(await context.window.TeacherPhoto.optimize(original), original);
});
