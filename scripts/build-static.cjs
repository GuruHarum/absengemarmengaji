"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const out = path.resolve('public-build');
const entries = ['index.html', 'admin.html', 'login.html', 'maintenance.html', 'offline.html', 'manifest.webmanifest', 'sw.js', '_headers', 'js', 'css', 'assets'];

// Penting: public-build adalah artefak hasil build, bukan sumber kedua.
// Selalu hapus versi lama agar tidak ada JS lama yang tertinggal saat deploy Netlify.
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const name of entries) {
    fs.cpSync(name, path.join(out, name), { recursive: true, force: true });
}

const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const rel of ['index.html', 'admin.html', 'sw.js', 'js/access.js', 'js/profile.js', 'js/push-notifications.js', 'js/notifications.js', 'js/attention-center.js', 'js/learning-groups.js', 'js/assessments.js', 'js/assessments-core.js', 'js/progress-form.js', 'js/report-cards.js', 'js/report-pdf.js', 'js/report-zip.js', 'js/ux-stage5.js', 'js/islamic-quotes.js', 'js/pwa.js', 'js/notifications.js', 'js/dashboard.js', 'js/gm-upgrade-20260928.js', 'js/database.js', 'js/ui.js', 'js/utils.js', 'js/public-app.js', 'css/ui-polish-20260928.css', 'css/ux-stage5.css', 'css/pwa.css', 'css/visual-stage8.css', 'css/rev37-visual-fixes.css', 'manifest.webmanifest', 'offline.html', 'assets/notification-badge-96.png', 'css/admin-polish.css']) {
    const source = path.resolve(rel);
    const built = path.join(out, rel);
    if (hash(source) !== hash(built)) {
        throw new Error(`Build tidak sinkron: ${rel}`);
    }
}

console.log('Static website prepared in public-build (loader43)');
