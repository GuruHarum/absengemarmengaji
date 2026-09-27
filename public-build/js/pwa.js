(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext)
        return;
    let pendingInstall, waiting, reloading = false;
    const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const dirty = () => window.StudentReports?.isBusy?.() || window.PeriodicAssessments?.hasUnsavedChanges?.() || window.ReportSettings?.hasUnsavedChanges?.() || (typeof selectedStudentStatus !== 'undefined' && Object.keys(selectedStudentStatus).length > 0);
    const bar = document.createElement('aside');
    bar.className = 'pwa-tools';
    bar.setAttribute('aria-label', 'Aplikasi Gemar Mengaji');
    document.body.append(bar);
    const install = document.createElement('button');
    install.className = 'secondary-action';
    install.textContent = 'Instal Aplikasi';
    install.hidden = true;
    bar.append(install);
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ios && !standalone())
        install.hidden = false;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pendingInstall = e; install.hidden = standalone(); });
    window.addEventListener('appinstalled', () => { install.hidden = true; pendingInstall = null; });
    install.onclick = async () => { if (pendingInstall) {
        await pendingInstall.prompt();
        await pendingInstall.userChoice;
        pendingInstall = null;
        install.hidden = true;
    }
    else {
        show('Di Safari, ketuk Bagikan, lalu Tambahkan ke Layar Utama.', [{ label: 'Mengerti', action: hide }]);
    } };
    const notice = document.createElement('div');
    notice.className = 'pwa-update';
    notice.hidden = true;
    notice.setAttribute('role', 'status');
    bar.append(notice);
    function hide() { notice.hidden = true; }
    function show(text, buttons) { notice.replaceChildren(); const p = document.createElement('p'); p.textContent = text; notice.append(p); for (const { label, action } of buttons) {
        const b = document.createElement('button');
        b.className = 'secondary-action';
        b.textContent = label;
        b.onclick = action;
        notice.append(b);
    } notice.hidden = false; }
    function update() { show('Pembaruan aplikasi tersedia.', [{ label: 'Perbarui Sekarang', action: () => { if (dirty()) {
                show('Simpan perubahan nilai atau absensi terlebih dahulu. Setelah selesai, tekan Perbarui.', [{ label: 'Perbarui', action: update }, { label: 'Nanti', action: hide }]);
                return;
            } reloading = true; waiting?.postMessage({ type: 'ACTIVATE' }); } }, { label: 'Nanti', action: hide }]); }
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading)
        location.reload();
    else if (!dirty())
        show('Versi baru telah aktif. Muat ulang setelah pekerjaan selesai.', [{ label: 'Muat ulang', action: () => { if (!dirty())
                    location.reload(); } }, { label: 'Nanti', action: hide }]); });
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => { if (reg.waiting) {
        waiting = reg.waiting;
        update();
    } reg.addEventListener('updatefound', () => { const worker = reg.installing; worker.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        waiting = worker;
        update();
    } }); }); }).catch(error => console.warn('PWA belum aktif:', error.message));
})();
