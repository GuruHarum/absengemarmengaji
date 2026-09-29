(async () => {
    try {
        await AppAccess.ready;
        const modules = ['js/admin-notices.js', 'js/class-picker.js', 'js/quran-surahs.js', 'js/surah-picker.js', 'js/report-reference.js', 'js/curriculum-targets.js', 'js/report-core.js', 'js/progress-form.js', 'js/assessments-core.js', 'js/learning-groups.js', 'js/assessments.js', 'js/report-pdf.js', 'js/report-zip.js', 'js/report-settings.js', 'js/report-cards.js', 'js/settings-hub.js', 'js/system-reset.js', 'js/account-deletion.js', 'js/accounts.js', 'js/profile.js', 'js/push-notifications.js', 'js/notifications.js', 'js/attention-center.js', 'js/enrollment.js', 'js/student-import.js', 'js/teacher-photo.js', 'js/dashboard.js', 'js/admin.js', 'js/api.js'];
        await Promise.all(modules.map(source => new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.async = false; // unduh paralel, jalankan sesuai urutan deklarasi
                script.src = ['js/student-import.js', 'js/dashboard.js', 'js/accounts.js', 'js/learning-groups.js', 'js/assessments.js', 'js/report-pdf.js', 'js/admin.js', 'js/api.js', 'js/profile.js', 'js/push-notifications.js', 'js/notifications.js', 'js/attention-center.js'].includes(source) ? `${source}?v=20260929-rev42` : source;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Gagal memuat ${source}`));
                document.body.appendChild(script);
            })));
        const school = await getSchoolProfile();
        if (school)
            applySchoolProfile(school);
        AppAccess.applyUI();
        document.dispatchEvent(new Event('panelready', { bubbles: true }));
        if (window.panelDataReady) Promise.resolve(window.panelDataReady).catch(error => console.error('Pemuatan data awal tertunda:', error));
        if (AppAccess.profile.temporaryPassword)
            switchPage('profil');
        else
            switchPage('dashboard');
        window.panelBooting = false;
        showLoading(false);
    }
    catch (error) {
        console.error('Panel tidak dapat dimulai:', error);
        document.documentElement.style.visibility = 'visible';
        const message = document.createElement('p');
        message.className = 'access-error';
        message.textContent = error.message + ' Muat ulang halaman atau hubungi koordinator.';
        if (document.getElementById('adminMain'))
            document.body.replaceChildren(message);
    }
})();
