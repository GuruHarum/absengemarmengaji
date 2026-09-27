(async () => {
    try {
        await AppAccess.ready;
        for (const source of ['js/admin-notices.js', 'js/class-picker.js', 'js/quran-surahs.js', 'js/surah-picker.js', 'js/report-reference.js', 'js/curriculum-targets.js', 'js/report-core.js', 'js/progress-form.js', 'js/assessments-core.js', 'js/assignments.js', 'js/assessments.js', 'js/report-pdf.js', 'js/report-settings.js', 'js/report-cards.js', 'js/settings-hub.js', 'js/account-deletion.js', 'js/accounts.js', 'js/profile.js', 'js/enrollment.js', 'js/vendor/xlsx.full.min.js', 'js/student-import.js', 'js/teacher-photo.js', 'js/dashboard.js', 'js/admin.js', 'js/api.js']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = ['js/student-import.js', 'js/dashboard.js'].includes(source) ? `${source}?v=20260926-student-guard-1` : source;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Gagal memuat ${source}`));
                document.body.appendChild(script);
            });
        }
        const school = await getSchoolProfile();
        if (school)
            applySchoolProfile(school);
        AppAccess.applyUI();
        document.dispatchEvent(new Event('panelready', { bubbles: true }));
        await window.panelDataReady;
        if (AppAccess.profile.temporaryPassword)
            switchPage('profil');
        else if (!AppAccess.canPage('absensi'))
            switchPage('penilaian');
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
