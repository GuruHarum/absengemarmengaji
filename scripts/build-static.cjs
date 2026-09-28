"use strict";
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const out = path.resolve('public-build');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const entries = ['index.html', 'admin.html', 'login.html', 'maintenance.html', 'offline.html', 'manifest.webmanifest', 'sw.js', '_headers', 'js', 'css', 'assets'];
for (const name of entries) fs.cpSync(name, path.join(out, name), { recursive: true });
const critical = ['index.html','sw.js','js/database.js','js/utils.js','js/ui.js','js/public-app.js'];
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const file of critical) {
  const a = hash(path.resolve(file)), b = hash(path.join(out, file));
  if (a !== b) throw new Error(`Build tidak sinkron: ${file}`);
}
fs.writeFileSync(path.join(out,'build-version.txt'), '20260928-roster18-sync\n');
console.log('Static website prepared in public-build (roster18-sync)');
