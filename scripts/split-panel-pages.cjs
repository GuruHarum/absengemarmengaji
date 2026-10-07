'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function splitPanelPages(out) {
    const lazy = new Set(['kelola', 'rapor', 'pengaturan', 'identitas', 'maintenance', 'penilaian', 'presentasi', 'arsip', 'kelompok', 'kelompok-tahsin']);
    fs.mkdirSync(path.join(out, 'pages'), { recursive: true });
    for (const role of ['admin', 'guru']) {
        const file = path.join(out, role + '.html');
        let html = fs.readFileSync(file, 'utf8');
        const manifest = {};
        const openings = /<div\b[^>]*\bid="page-([\w-]+)"[^>]*>/gi;
        let match;
        while ((match = openings.exec(html))) {
            const page = match[1];
            if (!lazy.has(page)) continue;
            const start = match.index + match[0].length;
            const tags = /<\/?div\b[^>]*>/gi;
            tags.lastIndex = start;
            let depth = 1, end;
            for (let tag; (tag = tags.exec(html));) {
                depth += tag[0].startsWith('</') ? -1 : 1;
                if (!depth) { end = tag.index; break; }
            }
            if (end == null) throw new Error('Unclosed panel page: ' + page);
            const content = html.slice(start, end);
            if (/<script\b/i.test(content)) throw new Error('Page fragment cannot contain scripts: ' + page);
            const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
            const url = `pages/${role}-${page}-${hash}.html`;
            fs.writeFileSync(path.join(out, url), content);
            manifest[page] = url;
            html = html.slice(0, start) + html.slice(end);
            openings.lastIndex = start;
        }
        // The manifest precedes the external loader; source mode retains all HTML.
        html = html.replace(/(<script\b[^>]*src="js\/panel-modules\.js[^" ]*"[^>]*>)/,
            `<script>window.GM_PANEL_PAGES=${JSON.stringify(manifest)};</script>\n$1`);
        fs.writeFileSync(file, html);
    }
}
module.exports = { splitPanelPages };
