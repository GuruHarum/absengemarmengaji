window.SettingsHub = (() => {
    let current = 'report';
    async function show(category) {
        const valid = ['report', 'accounts', 'reference'];
        if (!valid.includes(category)) return;
        if (category !== current && current === 'report' && window.ReportSettings?.hasUnsavedChanges?.()) {
            if (!(await AdminNotice.confirm('Ada perubahan rapor yang belum disimpan. Berpindah pengaturan tanpa menyimpannya?'))) return;
        }
        current = category;
        document.querySelectorAll('[data-settings-panel]').forEach(panel => {
            panel.hidden = panel.dataset.settingsPanel !== category;
        });
        document.querySelectorAll('[data-settings-view]').forEach(button => {
            const active = button.dataset.settingsView === category;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
    }
    document.addEventListener('panelready', () => {
        document.getElementById('settingsHubNav')?.addEventListener('click', event => {
            const button = event.target.closest('[data-settings-view]');
            if (button) void show(button.dataset.settingsView);
        });
        void show('report');
    });
    return { show, open: () => show(current) };
})();
