(async () => {
    try {
        await AppAccess.ready;
        for (const source of ['js/accounts.js', 'js/dashboard.js', 'js/admin.js', 'js/api.js']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = source;
                script.onload = resolve;
                script.onerror = () => reject(new Error(`Gagal memuat ${source}`));
                document.body.appendChild(script);
            });
        }
        const school = await getSchoolProfile();
        if (school) applySchoolProfile(school);
        AppAccess.applyUI();
        document.dispatchEvent(new Event('panelready', { bubbles: true }));
    } catch (error) {
        console.error('Panel tidak dapat dimulai:', error);
        document.documentElement.style.visibility = 'visible';
        const message = document.createElement('p');
        message.className = 'access-error';
        message.textContent = error.message + ' Muat ulang halaman atau hubungi koordinator.';
        if (document.getElementById('adminMain')) document.body.replaceChildren(message);
    }
})();
