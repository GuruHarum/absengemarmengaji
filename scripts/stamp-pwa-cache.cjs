'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function stampPwaCache(out) {
    const hash = crypto.createHash('sha256');
    function visit(directory, prefix = '') {
        for (const name of fs.readdirSync(directory).sort()) {
            const relative = prefix + name, file = path.join(directory, name);
            if (fs.statSync(file).isDirectory()) visit(file, relative + '/');
            else if (relative !== 'sw.js') {
                const bytes = fs.readFileSync(file);
                hash.update(JSON.stringify([relative, bytes.length])); hash.update(bytes);
            }
        }
    }
    visit(out);
    const file = path.join(out, 'sw.js'), original = fs.readFileSync(file, 'utf8');
    const base = original.match(/const VERSION = '([^']+)'/)[1].replace(/-build-[a-f0-9]{12}$/, '');
    const version = `${base}-build-${hash.digest('hex').slice(0, 12)}`;
    fs.writeFileSync(file, original.replace(/const VERSION = '[^']+'/, `const VERSION = '${version}'`));
    return version;
}
module.exports = { stampPwaCache };
