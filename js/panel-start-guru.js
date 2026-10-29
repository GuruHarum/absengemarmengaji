const googleLinkReturn = (() => {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const requested = params.get('gm_google_link') === '1';
        if (requested && window.history?.replaceState) {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('gm_google_link');
            window.history.replaceState({}, document.title, cleanUrl.toString());
        }
        return requested;
    } catch (_) {
        return false;
    }
})();

(async () => {
    try {
        await AppAccess.ready;
        if (window.GMPanelPreboot && !(await GMPanelPreboot.prepare('teacher'))) return;
        await GMPanel.boot('teacher');
        const school = await getSchoolProfile();
        if (school) applySchoolProfile(school);
        AppAccess.applyUI();
        document.dispatchEvent(new Event('panelready', { bubbles: true }));
        if (window.panelDataReady) Promise.resolve(window.panelDataReady).catch(error => console.error('Pemuatan data awal tertunda:', error));
        if (AppAccess.profile.temporaryPassword || googleLinkReturn) await switchPage('profil');
        else await switchPage('dashboard');
        if (document.documentElement.classList.contains('gm-login-transition'))
            await new Promise(resolve => requestAnimationFrame(resolve));
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
