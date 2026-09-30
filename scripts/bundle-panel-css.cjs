'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Bundle consecutive local stylesheets only: inline styles remain in cascade order.
// Output stays in css/ so relative asset URLs keep their original meaning.
function bundlePanelCss(out) {
    for (const page of ['admin.html', 'guru.html']) {
        const file = path.join(out, page);
        const html = fs.readFileSync(file, 'utf8');
        const result = html.replace(/(?:<link\b[^>]*>\s*)+/gi, group => {
            const tags = [...group.matchAll(/<link\b[^>]*>/gi)];
            const sources = tags.map(([tag]) => {
                if (!/\brel=["']stylesheet["']/i.test(tag)) return null;
                const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
                return href && /^\/?css\/[\w.-]+\.css(?:\?[^"']*)?$/.test(href)
                    ? href.replace(/^\//, '').split('?')[0] : null;
            });
            if (sources.length < 2 || sources.some(source => !source)) return group;
            const css = sources.map(source => {
                const content = fs.readFileSync(path.join(out, source), 'utf8');
                if (/@import\b|@charset\b/i.test(content)) {
                    throw new Error(`Cannot safely bundle CSS directives: ${source}`);
                }
                return `/* Source: ${source} */\n${content}\n`;
            }).join('\n');
            const digest = crypto.createHash('sha256').update(css).digest('hex').slice(0, 12);
            const name = `panel-${digest}.css`;
            fs.writeFileSync(path.join(out, 'css', name), css);
            return `<link rel="stylesheet" href="css/${name}">\n`;
        });
        fs.writeFileSync(file, result);
    }
}

module.exports = { bundlePanelCss };
