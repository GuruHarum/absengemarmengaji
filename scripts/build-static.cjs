"use strict";
const fs = require('node:fs'), path = require('node:path');
const out = path.resolve('public-build');
fs.mkdirSync(out, { recursive: true });
for (const name of ['index.html', 'admin.html', 'login.html', 'maintenance.html', 'offline.html', 'manifest.webmanifest', 'sw.js', '_headers', 'js', 'css', 'assets'])
    fs.cpSync(name, path.join(out, name), { recursive: true });
console.log('Static website prepared in public-build');
