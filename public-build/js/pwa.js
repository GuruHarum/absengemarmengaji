(() => {
    function ensureFootnote() {
        if (document.querySelector('.gm-app-footnote')) return;
        const foot = document.createElement('footer');
        foot.className = 'gm-app-footnote';
        foot.innerHTML = 'aplikasi dibuat oleh <strong>Geys Amadda Dien</strong>';
        const target = document.querySelector('.admin-workspace') || document.querySelector('main') || document.body;
        target?.append?.(foot);
    }
    ensureFootnote();
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    const BUILD = 'loader54';
    let pendingInstall = null;
    let waitingWorker = null;
    let registration = null;
    let reloading = false;
    let updateCheckTimer = null;
    let onlineToastTimer = null;

    const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = () => /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
    const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const dirty = () => Boolean(
        window.StudentReports?.isBusy?.() ||
        window.PeriodicAssessments?.hasUnsavedChanges?.() ||
        window.ReportSettings?.hasUnsavedChanges?.() ||
        (typeof selectedStudentStatus !== 'undefined' && selectedStudentStatus && Object.keys(selectedStudentStatus).length > 0)
    );

    const tools = document.createElement('aside');
    tools.className = 'pwa-tools';
    tools.setAttribute('aria-label', 'Status aplikasi Gemar Mengaji');
    tools.dataset.build = BUILD;

    const installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.className = 'pwa-install-chip';
    installButton.textContent = 'Instal aplikasi';
    installButton.hidden = true;

    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = 'pwa-status-chip';
    statusButton.setAttribute('aria-label', 'Buka pusat pembaruan aplikasi');

    const connection = document.createElement('div');
    connection.className = 'pwa-connection';
    connection.setAttribute('role', 'status');
    connection.hidden = navigator.onLine;
    connection.innerHTML = '<span aria-hidden="true"></span><strong>Offline</strong><small>Menunggu koneksi internet</small>';

    const notice = document.createElement('div');
    notice.className = 'pwa-update';
    notice.hidden = true;
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');

    tools.append(statusButton, installButton, connection, notice);
    document.body.append(tools);

    // REV52: pada aplikasi yang sudah terpasang (standalone/PWA), kontrol PWA
    // tidak ditampilkan agar tidak menutupi antarmuka. Service worker tetap aktif
    // dan pembaruan dijalankan diam-diam ketika tidak ada pekerjaan belum disimpan.
    function updateToolsVisibility() {
        tools.hidden = standalone();
    }
    updateToolsVisibility();

    function modeLabel() {
        if (standalone()) return isIOS() ? 'PWA iPhone/iPad' : 'PWA';
        return 'Browser';
    }
    function updateStatusChip() {
        statusButton.textContent = `${modeLabel()} · 53`;
        statusButton.dataset.mode = standalone() ? 'pwa' : 'browser';
    }
    function setPreview(mode) {
        if (!document.body?.classList.contains('admin-page')) return;
        if (!mode || mode === 'auto') delete document.documentElement.dataset.gmPreview;
        else document.documentElement.dataset.gmPreview = mode;
        try { localStorage.setItem('gm_preview_mode_v46', mode || 'auto'); } catch (_) {}
    }
    async function toggleFullscreen() {
        if (window.GMRev46?.toggleFullscreen) return GMRev46.toggleFullscreen();
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
        } catch (_) { }
    }
    function showCenter() {
        const installed = standalone();
        const lines = [
            `Mode: ${modeLabel()}.`,
            `Versi aplikasi: ${BUILD}.`,
            navigator.onLine ? 'Koneksi: online.' : 'Koneksi: offline.'
        ];
        const buttons = [
            { label: 'Periksa update', action: async () => { await checkForUpdate(); showCenter(); }, primary: true }
        ];
        if (!installed) buttons.push({ label: isIOS() ? 'Cara pasang iPhone' : 'Instal aplikasi', action: () => installButton.click() });
        if (document.body?.classList.contains('admin-page')) {
            buttons.push({ label: 'Preview mobile', action: () => { setPreview('mobile'); hideNotice(); } });
            buttons.push({ label: 'Preview desktop', action: () => { setPreview('desktop'); hideNotice(); } });
            buttons.push({ label: 'Preview otomatis', action: () => { setPreview('auto'); hideNotice(); } });
            if (document.documentElement.requestFullscreen || window.GMRev46?.toggleFullscreen) buttons.push({ label: 'Layar penuh', action: toggleFullscreen });
        }
        showNotice('Pusat aplikasi', lines.join(' '), buttons);
    }
    function hideNotice() {
        notice.hidden = true;
    }

    function showNotice(title, message, buttons = []) {
        notice.replaceChildren();
        const copy = document.createElement('div');
        copy.className = 'pwa-update-copy';
        const strong = document.createElement('strong');
        strong.textContent = title;
        const p = document.createElement('p');
        p.textContent = message;
        copy.append(strong, p);
        notice.append(copy);
        if (buttons.length) {
            const actions = document.createElement('div');
            actions.className = 'pwa-update-actions';
            buttons.forEach(({ label, action, primary = false }) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = primary ? 'pwa-action-primary' : 'pwa-action-secondary';
                button.textContent = label;
                button.addEventListener('click', action);
                actions.append(button);
            });
            notice.append(actions);
        }
        notice.hidden = false;
    }

    function activateWaitingSilently() {
        if (!waitingWorker || !standalone() || dirty()) return false;
        reloading = true;
        waitingWorker.postMessage({ type: 'ACTIVATE' });
        return true;
    }

    function showUpdate() {
        if (!waitingWorker) return;
        if (standalone()) { activateWaitingSilently(); return; }
        showNotice(
            'Pembaruan tersedia',
            'Versi terbaru Gemar Mengaji sudah siap digunakan.',
            [
                {
                    label: 'Perbarui sekarang',
                    primary: true,
                    action: () => {
                        if (dirty()) {
                            showNotice(
                                'Selesaikan perubahan dulu',
                                'Simpan nilai atau pekerjaan yang sedang diedit, lalu perbarui aplikasi.',
                                [
                                    { label: 'Nanti', action: hideNotice },
                                    { label: 'Coba lagi', primary: true, action: showUpdate }
                                ]
                            );
                            return;
                        }
                        reloading = true;
                        waitingWorker.postMessage({ type: 'ACTIVATE' });
                    }
                },
                { label: 'Nanti', action: hideNotice }
            ]
        );
    }

    function updateInstallVisibility() {
        const ios = isIOS();
        installButton.hidden = standalone() || (!pendingInstall && !ios);
        if (ios && !pendingInstall && !standalone()) installButton.textContent = 'Pasang di iPhone/iPad';
        else installButton.textContent = 'Instal aplikasi';
    }

    async function checkForUpdate() {
        if (!navigator.onLine || !registration) return;
        try { await registration.update(); }
        catch (error) { console.debug('Pemeriksaan pembaruan PWA ditunda:', error?.message || error); }
    }

    function scheduleUpdateChecks() {
        clearInterval(updateCheckTimer);
        updateCheckTimer = setInterval(checkForUpdate, 30 * 60 * 1000);
    }

    function setConnectionState() {
        const online = navigator.onLine;
        updateToolsVisibility();
        connection.hidden = online;
        document.documentElement.classList.toggle('pwa-offline', !online);
        if (online) {
            clearTimeout(onlineToastTimer);
            showNotice('Koneksi kembali', 'Gemar Mengaji sudah terhubung ke internet.');
            onlineToastTimer = setTimeout(() => {
                if (!waitingWorker) hideNotice();
            }, 2200);
            void checkForUpdate();
        }
    }

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        pendingInstall = event;
        updateInstallVisibility();
    });

    window.addEventListener('appinstalled', () => {
        pendingInstall = null;
        updateInstallVisibility();
        updateStatusChip();
        updateToolsVisibility();
        hideNotice();
    });

    statusButton.addEventListener('click', showCenter);

    installButton.addEventListener('click', async () => {
        if (pendingInstall) {
            const prompt = pendingInstall;
            pendingInstall = null;
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            updateInstallVisibility();
            return;
        }
        const safariHint = isSafari()
            ? 'Ketuk tombol Bagikan (kotak dengan panah ke atas), pilih Tambahkan ke Layar Utama, lalu ketuk Tambah.'
            : 'Di iPhone/iPad, buka halaman ini di Safari. Ketuk Bagikan (kotak dengan panah ke atas), pilih Tambahkan ke Layar Utama, lalu ketuk Tambah.';
        showNotice(
            'Pasang Gemar Mengaji di iPhone/iPad',
            safariHint + ' Setelah terpasang, buka dari ikon Gemar Mengaji di Layar Utama agar mode aplikasi dan notifikasi web dapat bekerja sesuai dukungan iOS.',
            [{ label: 'Mengerti', primary: true, action: hideNotice }]
        );
    });

    window.addEventListener('online', setConnectionState);
    window.addEventListener('offline', setConnectionState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            updateToolsVisibility();
            if (!activateWaitingSilently()) void checkForUpdate();
        }
    });
    window.addEventListener('focus', () => {
        updateToolsVisibility();
        if (!activateWaitingSilently()) void checkForUpdate();
    });
    window.addEventListener('pageshow', () => {
        updateInstallVisibility();
        updateStatusChip();
        updateToolsVisibility();
        if (!activateWaitingSilently()) void checkForUpdate();
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) {
            location.reload();
            return;
        }
        if (!dirty()) {
            showNotice(
                'Aplikasi sudah diperbarui',
                'Muat ulang untuk menggunakan versi terbaru.',
                [
                    { label: 'Nanti', action: hideNotice },
                    { label: 'Muat ulang', primary: true, action: () => { if (!dirty()) location.reload(); } }
                ]
            );
        }
    });

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => {
            registration = reg;
            if (reg.waiting) {
                waitingWorker = reg.waiting;
                showUpdate();
            }
            reg.addEventListener('updatefound', () => {
                const worker = reg.installing;
                if (!worker) return;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        waitingWorker = worker;
                        showUpdate();
                    }
                });
            });
            scheduleUpdateChecks();
            void checkForUpdate();
        })
        .catch(error => console.warn('PWA belum aktif:', error?.message || error));

    updateInstallVisibility();
    updateStatusChip();
    try {
        const preview = localStorage.getItem('gm_preview_mode_v46') || 'auto';
        if (document.body?.classList.contains('admin-page')) setPreview(preview);
    } catch (_) { }
    if (!navigator.onLine) setConnectionState();

    window.GMPWA = {
        build: BUILD,
        get installed() { return standalone(); },
        checkForUpdate,
        get registration() { return registration; }
    };
})();
