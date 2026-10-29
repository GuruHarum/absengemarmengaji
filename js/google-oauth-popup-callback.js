(() => {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const nonce = params.get('nonce');
    const title = document.getElementById('oauthTitle');
    const status = document.getElementById('oauthStatus');
    const loader = document.getElementById('oauthLoader');
    const closeButton = document.getElementById('oauthClose');
    const allowedRoles = ['admin', 'koordinator', 'guru'];
    let completed = false;
    let resultChannel = null;

    // Google/provider COOP headers can sever window.opener during cross-origin navigation.
    // A nonce-scoped same-origin channel returns the verified result when the popup comes back.
    try {
        if (/^[a-f0-9]{48}$/.test(nonce || '') && typeof window.BroadcastChannel === 'function') {
            resultChannel = new window.BroadcastChannel(`gm_google_oauth_${nonce}`);
        }
    } catch (_) {}

    function renderState(heading, message, isError = false) {
        if (title) title.textContent = heading;
        if (status) {
            status.textContent = message;
            status.style.color = isError ? '#a33a32' : '';
        }
        if (loader) loader.hidden = true;
        const main = document.querySelector('.oauth-window');
        if (main) main.setAttribute('aria-busy', 'false');
    }

    function closeWindow() {
        try { window.close(); } catch (_) {}
    }

    function complete(result) {
        if (completed) return;
        completed = true;
        const payload = {
            type: 'GM_GOOGLE_OAUTH_RESULT',
            mode,
            nonce,
            ok: result.ok === true,
            userId: result.userId || null,
            role: result.role || null,
            message: result.message || '',
            // Return only the minimum session tokens needed by the login tab.
            // The payload travels over a nonce-scoped BroadcastChannel or an
            // exact-origin postMessage; do not place tokens in URLs or logs.
            session: mode === 'login' && result.session
                ? {
                    access_token: result.session.access_token,
                    refresh_token: result.session.refresh_token
                }
                : null
        };

        let delivered = false;

        // Preferred path: BroadcastChannel works even when window.opener is unavailable.
        if (resultChannel) {
            try {
                resultChannel.postMessage(payload);
                delivered = true;
            } catch (_) {}
        }

        // Preserve the existing postMessage path for browsers where the opener survives.
        const openerAvailable = Boolean(window.opener && !window.opener.closed);
        if (openerAvailable) {
            try {
                window.opener.postMessage(payload, window.location.origin);
                delivered = true;
            } catch (_) {}
        }

        if (delivered) {
            renderState(
                payload.ok ? 'Berhasil' : 'Belum berhasil',
                payload.ok
                    ? (mode === 'login' ? 'Login berhasil. Jendela ini akan menutup dan aplikasi akan dibuka.' : 'Akun Google sudah diverifikasi. Jendela ini akan menutup dan Profil diperbarui.')
                    : payload.message || 'Google belum berhasil diverifikasi. Kembali ke aplikasi untuk mencoba lagi.',
                !payload.ok
            );
            window.setTimeout(closeWindow, 300);
            return;
        }

        renderState(
            payload.ok ? 'Verifikasi selesai' : 'Verifikasi belum berhasil',
            payload.ok
                ? 'Verifikasi selesai, tetapi komunikasi ke halaman utama tidak tersedia. Tutup jendela ini dan kembali ke aplikasi.'
                : payload.message || 'Kembali ke aplikasi Gemar Mengaji dan coba kembali.',
            !payload.ok
        );
        if (closeButton) closeButton.hidden = false;
    }

    closeButton?.addEventListener('click', closeWindow);

    async function run() {
        if (!['login', 'link'].includes(mode) || !/^[a-f0-9]{48}$/.test(nonce || '')) {
            complete({
                ok: false,
                message: 'Data proses pop-up tidak lengkap. Tutup jendela ini, lalu mulai kembali dari aplikasi Gemar Mengaji.'
            });
            return;
        }

        const queryError = params.get('error_description') || params.get('error');
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const hashError = hashParams.get('error_description') || hashParams.get('error');
        if (queryError || hashError) {
            complete({
                ok: false,
                message: 'Google membatalkan atau tidak menyelesaikan autentikasi. Kembali ke aplikasi dan coba lagi.'
            });
            return;
        }

        try {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;
            if (!sessionData?.session) {
                throw new Error('Sesi Google belum berhasil disimpan. Coba ulangi proses dari aplikasi.');
            }

            const { data: userData, error: userError } = await supabase.auth.getUser();
            const user = userData?.user;
            if (userError || !user) throw userError || new Error('Identitas akun tidak dapat diverifikasi.');

            const googleIdentityExists = Array.isArray(user.identities)
                && user.identities.some(identity => identity?.provider === 'google');
            if (!googleIdentityExists) {
                if (mode === 'login') {
                    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
                }
                throw new Error(mode === 'login'
                    ? 'Akun Google ini belum tertaut ke akun Gemar Mengaji. Masuk memakai akun biasa, lalu tautkan Google melalui Profil.'
                    : 'Identitas Google belum terkonfirmasi pada akun yang sedang login. Coba kembali dari Profil.');
            }

            const { data: access, error: accessError } = await supabase
                .from('user_roles')
                .select('role,teacher_id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (accessError || !access || !allowedRoles.includes(access.role)
                || (access.role === 'guru' && !access.teacher_id)) {
                if (mode === 'login') {
                    try { await supabase.auth.signOut({ scope: 'local' }); } catch (_) {}
                }
                throw new Error('Akun Google belum memiliki akses Gemar Mengaji yang valid. Gunakan akun yang sudah dibuat dan ditautkan oleh pengelola sekolah.');
            }

            complete({
                ok: true,
                userId: user.id,
                role: access.role,
                session: mode === 'login'
                    ? {
                        access_token: sessionData.session.access_token,
                        refresh_token: sessionData.session.refresh_token
                    }
                    : null
            });
        } catch (error) {
            const details = String(error?.message || '').toLowerCase();
            let message = 'Verifikasi Google belum berhasil. Kembali ke aplikasi dan coba lagi.';
            if (details.includes('network') || details.includes('fetch')) {
                message = 'Koneksi bermasalah saat memeriksa akun Google. Periksa internet lalu coba kembali.';
            } else if (String(error?.message || '').trim()) {
                message = String(error.message).trim().slice(0, 240);
            }
            complete({ ok: false, message });
        }
    }

    void run();
})();