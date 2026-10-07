(() => {
    const version = '20261007-data63';
    const core = ['admin-notices','class-picker','quran-surahs','report-reference','report-core','assessments-core','teacher-photo','profile','push-notifications','notifications','attention-center','dashboard','rev46-experience','admin','api'];
    const definitions = {
        curriculum: { files: ['curriculum-targets'] },
        progress: { files: ['surah-picker','progress-form'] },
        assessment: { dependencies: ['progress'], files: ['assessments'] },
        groups: { files: ['learning-groups'] },
        excel: { files: ['report-excel'] },
        reports: { dependencies: ['assessment'], files: ['report-pdf','report-zip','report-cards'] },
        settings: { dependencies: ['progress'], files: ['report-settings','settings-hub','system-reset','account-deletion','accounts'] },
        photo: { files: [] },
        profile: { files: [] },
        manage: { dependencies: ['photo'], files: ['student-import','enrollment'] },
        chart: { urls: ['https://cdn.jsdelivr.net/npm/chart.js'] },
        pdf: { urls: ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js'] }
    };
    const routes = { profil: ['profile'], penilaian: ['assessment'], rapor: ['reports'], pengaturan: ['settings'], kelola: ['manage'], kelompok: ['groups'], 'kelompok-tahsin': ['groups'], presentasi: ['chart'] };
    const scripts = new Map(), pending = new Map(), loaded = new Set();
    const pagePending = new Map(), mounted = new Set(), pageCallbacks = new Map();
    const groupPages = { assessment: ['penilaian'], reports: ['rapor'], settings: ['pengaturan'], manage: ['kelola'], groups: ['kelompok', 'kelompok-tahsin'] };
    let role = 'coordinator', ready = false, navigation = 0;
    document.addEventListener('panelready', () => { ready = true; }, { once: true });
    function script(url) {
        if (scripts.has(url)) return scripts.get(url);
        const promise = new Promise((resolve, reject) => {
            const element = document.createElement('script');
            element.async = false;
            element.src = url;
            element.onload = resolve;
            element.onerror = () => { scripts.delete(url); element.remove(); reject(new Error(`Gagal memuat ${url}`)); };
            document.body.appendChild(element);
        });
        scripts.set(url, promise);
        return promise;
    }
    function files(names) { return names.map(name => `js/${name}.js?v=${version}`); }
    function onReady(callback) {
        if (ready) callback(new Event('panelready'));
        else document.addEventListener('panelready', callback, { once: true });
    }
    function pageAvailable(page) { return !window.GM_PANEL_PAGES?.[page] || mounted.has(page); }
    async function mountPage(page) {
        const url = window.GM_PANEL_PAGES?.[page];
        if (!url || mounted.has(page)) return;
        if (pagePending.has(page)) return pagePending.get(page);
        const promise = (async () => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Laman ${page} gagal dimuat`);
            const html = await response.text();
            const target = document.getElementById(`page-${page}`);
            if (!target) throw new Error(`Wadah laman ${page} tidak tersedia`);
            target.innerHTML = html;
            mounted.add(page);
            for (const callback of pageCallbacks.get(page) || []) onReady(callback);
            pageCallbacks.delete(page);
            window.AppAccess?.applyUI?.();
        })();
        pagePending.set(page, promise);
        try { await promise; } finally { pagePending.delete(page); }
    }
    async function load(name) {
        if (loaded.has(name)) return;
        if (pending.has(name)) return pending.get(name);
        const definition = definitions[name];
        if (!definition) throw new Error(`Modul tidak dikenal: ${name}`);
        const promise = (async () => {
            await Promise.all((groupPages[name] || []).map(mountPage));
            await Promise.all((definition.dependencies || []).map(load));
            const sources = window.GM_PANEL_ASSETS?.[name] || definition.urls || files((definition.files || []).filter(file => role !== 'teacher' || file !== 'enrollment'));
            await Promise.all(sources.map(script));
            loaded.add(name);
        })();
        pending.set(name, promise);
        try { await promise; } finally { pending.delete(name); }
    }
    window.GMPanel = {
        async boot(value) {
            role = value;
            if (role !== 'teacher') await load('curriculum');
            await Promise.all((window.GM_PANEL_ASSETS?.core || files(core)).map(script));
            loaded.add('photo');
            loaded.add('profile');
        },
        load,
        mountPage,
        onPage(page, callback) {
            if (pageAvailable(page)) return onReady(callback);
            const callbacks = pageCallbacks.get(page) || [];
            callbacks.push(callback); pageCallbacks.set(page, callbacks);
        },
        onReady(callback) {
            onReady(callback);
        },
        navigate(page, open) {
            const token = ++navigation;
            const groups = routes[page] || [];
            const dataReady = page !== 'absensi' || (!window.GM_ROSTER_DIRTY && Array.isArray(window.tahsinRosterStudents) && Array.isArray(window.tahsinRosterTeachers));
            if (pageAvailable(page) && dataReady && groups.every(name => loaded.has(name))) return open();
            return mountPage(page).then(async () => {
                await Promise.all(groups.map(load));
                if (page === 'absensi' && typeof ensureAttendanceWorkspaceData === 'function') await ensureAttendanceWorkspaceData();
                if (token === navigation) return open();
            }).catch(error => {
                console.error('Menu tidak dapat dimuat:', error);
                if (token === navigation) window.AdminNotice?.notify?.(error.message + '. Silakan coba kembali.', 'error');
            });
        }
    };
})();
