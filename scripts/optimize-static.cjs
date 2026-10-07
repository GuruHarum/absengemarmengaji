'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function optimizeStatic(out) {
    let esbuild, postcss, tailwind;
    try {
        esbuild = require('esbuild');
        postcss = require('postcss');
        tailwind = require('tailwindcss');
    } catch (error) {
        throw new Error('Dependensi optimasi build belum tersedia. Jalankan npm ci sebelum build.', { cause: error });
    }
    const pages = fs.readdirSync(out).filter(name => name.endsWith('.html'));
    const content = pages.map(name => ({ raw: fs.readFileSync(path.join(out, name), 'utf8'), extension: 'html' }));
    const fragments = path.join(out, 'pages');
    if (fs.existsSync(fragments)) {
        for (const name of fs.readdirSync(fragments)) content.push({ raw: fs.readFileSync(path.join(fragments, name), 'utf8'), extension: 'html' });
    }
    for (const name of fs.readdirSync(path.join(out, 'js')).filter(name => name.endsWith('.js'))) {
        content.push({ raw: fs.readFileSync(path.join(out, 'js', name), 'utf8'), extension: 'js' });
    }
    const result = await postcss([tailwind({ content, theme: { extend: {} }, plugins: [] })])
        .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
    const css = (await esbuild.transform(result.css, { loader: 'css', minify: true })).code;
    const digest = crypto.createHash('sha256').update(css).digest('hex').slice(0, 12);
    const filename = `css/tailwind-${digest}.css`;
    fs.writeFileSync(path.join(out, filename), css);
    for (const page of pages) {
        const file = path.join(out, page);
        const original = fs.readFileSync(file, 'utf8');
        const html = original.replace(/<script\b[^>]*src=["']https:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*<\/script>/gi, '')
            .replace(/<\/head>/i, original.includes('cdn.tailwindcss.com') ? `<link rel="stylesheet" href="${filename}">\n</head>` : '</head>');
        fs.writeFileSync(file, html);
    }
    // Cache the compiled stylesheet for offline pages as well as online navigation.
    const worker = path.join(out, 'sw.js');
    if (fs.existsSync(worker)) {
        fs.writeFileSync(worker, fs.readFileSync(worker, 'utf8')
            .replace('const PRECACHE = [', `const PRECACHE = [\n  '/${filename}',`));
    }
    // Keep global names: classic scripts and inline onclick handlers depend on them.
    for (const name of fs.readdirSync(path.join(out, 'js')).filter(name => name.endsWith('.js'))) {
        const file = path.join(out, 'js', name);
        const transformed = await esbuild.transform(fs.readFileSync(file, 'utf8'), {
            loader: 'js', target: 'es2020', minifyWhitespace: true,
            minifyIdentifiers: false, minifySyntax: false, legalComments: 'inline'
        });
        fs.writeFileSync(file, transformed.code);
    }
    for (const name of fs.readdirSync(path.join(out, 'css')).filter(name => name.endsWith('.css'))) {
        const file = path.join(out, 'css', name);
        fs.writeFileSync(file, (await esbuild.transform(fs.readFileSync(file, 'utf8'), { loader: 'css', minifyWhitespace: true })).code);
    }
    // Hash the final bytes, including minification, before enabling immutable caching.
    const renamed = new Map();
    for (const directory of ['js', 'css']) {
        for (const name of fs.readdirSync(path.join(out, directory)).filter(name => /^(panel|tailwind)-[a-f0-9]{12}\.(js|css)$/.test(name))) {
            const file = path.join(out, directory, name);
            const bytes = fs.readFileSync(file);
            const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
            const target = name.replace(/[a-f0-9]{12}/, hash);
            if (target === name) continue;
            fs.writeFileSync(path.join(out, directory, target), bytes);
            fs.unlinkSync(file);
            renamed.set(`${directory}/${name}`, `${directory}/${target}`);
        }
    }
    for (const relative of [...pages, ...(fs.existsSync(worker) ? ['sw.js'] : []), ...fs.readdirSync(path.join(out, 'js')).filter(name => name.endsWith('.js')).map(name => 'js/' + name)]) {
        const file = path.join(out, relative);
        let text = fs.readFileSync(file, 'utf8');
        for (const [before, after] of renamed) text = text.split(before).join(after);
        fs.writeFileSync(file, text);
    }
    return true;
}
module.exports = { optimizeStatic };
