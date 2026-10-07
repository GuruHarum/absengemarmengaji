'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
async function optimizeImages(out) {
    const assets = path.join(out, 'assets');
    let saved = 0;
    for (const name of fs.readdirSync(assets).filter(name => name.endsWith('.png'))) {
        const file = path.join(assets, name), original = fs.readFileSync(file);
        // No palette reduction, resizing or change to alpha for Office logos/icons.
        const compressed = await sharp(original).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
        if (compressed.length < original.length) { fs.writeFileSync(file, compressed); saved += original.length - compressed.length; }
    }
    const logo = await sharp(fs.readFileSync(path.join(assets, 'school-logo.png')))
        .resize({ width: 192, height: 192, fit: 'inside', withoutEnlargement: true })
        .webp({ lossless: true, effort: 6 }).toBuffer();
    const hash = require('node:crypto').createHash('sha256').update(logo).digest('hex').slice(0, 12);
    const url = `assets/school-logo-web-${hash}.webp`;
    fs.writeFileSync(path.join(out, url), logo);
    const htmlFiles = fs.readdirSync(out).filter(name => name.endsWith('.html'));
    if (fs.existsSync(path.join(out, 'pages'))) htmlFiles.push(...fs.readdirSync(path.join(out, 'pages')).map(name => 'pages/' + name));
    for (const relative of htmlFiles) {
        const file = path.join(out, relative);
        let text = fs.readFileSync(file, 'utf8').replace(/(["'])\/?assets\/school-logo\.png\1/g, `$1${url}$1`);
        if (!relative.startsWith('pages/')) text = text.replace(/<\/head>/i, `<script>window.GM_WEB_ASSETS={schoolLogo:${JSON.stringify(url)}};</script>\n</head>`);
        fs.writeFileSync(file, text);
    }
    const worker = path.join(out, 'sw.js');
    fs.writeFileSync(worker, fs.readFileSync(worker, 'utf8').replace('const PRECACHE = [', `const PRECACHE = [\n  '/${url}',`));
    return { saved, webLogoBytes: logo.length };
}
module.exports = { optimizeImages };
