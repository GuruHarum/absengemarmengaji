(async () => {
    try {
        await AppAccess.ready;
        if (window.GMPanelPreboot && !(await GMPanelPreboot.prepare('teacher'))) return;
        const modules = [
            'js/admin-notices.js',
            'js/class-picker.js',
            'js/quran-surahs.js',
            'js/surah-picker.js',
            'js/report-reference.js',
            'js/report-core.js',
            'js/progress-form.js',
            'js/assessments-core.js',
            'js/learning-groups.js',
            'js/assessments.js',
            'js/teacher-photo.js',
            'js/profile.js',
            'js/push-notifications.js',
            'js/notifications.js',
            'js/attention-center.js',
            'js/dashboard.js',
            'js/rev46-experience.js',
            'js/admin.js',
            'js/api.js'
        ];
        const versioned = new Set([
            'js/admin-notices.js','js/dashboard.js','js/rev46-experience.js','js/learning-groups.js',
            'js/assessments.js','js/admin.js','js/api.js','js/profile.js','js/push-notifications.js',
            'js/notifications.js','js/attention-center.js','js/teacher-photo.js'
        ]);
        await Promise.all(modules.map(source => new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.async = false;
            script.src = versioned.has(source) ? `${source}?v=20261001-refine1` : source;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Gagal memuat ${source}`));
            document.body.appendChild(script);
        })));
        const school = await getSchoolProfile();
        if (school) applySchoolProfile(school);
        AppAccess.applyUI();
        document.dispatchEvent(new Event('panelready', { bubbles: true }));
        if (window.panelDataReady) Promise.resolve(window.panelDataReady).catch(error => console.error('Pemuatan data awal tertunda:', error));
        if (AppAccess.profile.temporaryPassword) switchPage('profil');
        else switchPage('dashboard');
        window.panelBooting = false;
        showLoading(false);
    } catch (error) {
        console.error('Panel guru tidak dapat dimulai:', error);
        document.documentElement.style.visibility = 'visible';
        const message = document.createElement('p');
        message.className = 'access-error';
        message.textContent = error.message + ' Muat ulang halaman atau hubungi koordinator.';
        if (document.getElementById('adminMain')) document.body.replaceChildren(message);
    }
})();
