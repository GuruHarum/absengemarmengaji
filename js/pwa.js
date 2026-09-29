(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    const BUILD = 'loader36';
    let pendingInstall = null;
    let waitingWorker = null;
    let registration = null;
    let reloading = false;
    let updateCheckTimer = null;
    let onlineToastTimer = null;

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

    tools.append(installButton, connection, notice);
    document.body.append(tools);

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

    function showUpdate() {
        if (!waitingWorker) return;
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
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        installButton.hidden = standalone() || (!pendingInstall && !ios);
        if (ios && !pendingInstall && !standalone()) installButton.textContent = 'Pasang di layar utama';
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
        hideNotice();
    });

    installButton.addEventListener('click', async () => {
        if (pendingInstall) {
            const prompt = pendingInstall;
            pendingInstall = null;
            await prompt.prompt();
            await prompt.userChoice.catch(() => null);
            updateInstallVisibility();
            return;
        }
        showNotice(
            'Pasang Gemar Mengaji',
            'Di Safari, ketuk Bagikan lalu pilih Tambahkan ke Layar Utama.',
            [{ label: 'Mengerti', primary: true, action: hideNotice }]
        );
    });

    window.addEventListener('online', setConnectionState);
    window.addEventListener('offline', setConnectionState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdate();
    });
    window.addEventListener('focus', () => void checkForUpdate());

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
    if (!navigator.onLine) setConnectionState();

    window.GMPWA = {
        build: BUILD,
        get installed() { return standalone(); },
        checkForUpdate,
        get registration() { return registration; }
    };
})();
