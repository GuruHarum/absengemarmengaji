(() => {
    'use strict';

    const MESSAGE_TYPE = 'GM_GOOGLE_OAUTH_RESULT';
    const POPUP_TIMEOUT_MS = 180000;

    function createNonce() {
        const bytes = new Uint8Array(24);
        if (!window.crypto?.getRandomValues) {
            throw new Error('Browser tidak mendukung proses login Google yang aman. Perbarui browser lalu coba kembali.');
        }
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    }

    function popupFeatures() {
        const width = 520;
        const height = 680;
        const screenWidth = window.screen?.availWidth || width;
        const screenHeight = window.screen?.availHeight || height;
        const left = Math.max(0, Math.round((screenWidth - width) / 2));
        const top = Math.max(0, Math.round((screenHeight - height) / 2));
        return [
            'popup=yes',
            `width=${width}`,
            `height=${height}`,
            `left=${left}`,
            `top=${top}`,
            'resizable=yes',
            'scrollbars=yes'
        ].join(',');
    }

    function prepare({ mode, expectedUserId = null } = {}) {
        if (!['login', 'link'].includes(mode)) {
            throw new Error('Mode autentikasi Google tidak valid.');
        }

        const nonce = createNonce();
        const redirectTo = new URL('oauth-popup.html', window.location.origin);
        redirectTo.searchParams.set('v', '20261029-popup3');
        redirectTo.searchParams.set('mode', mode);
        redirectTo.searchParams.set('nonce', nonce);

        // The same-origin channel remains usable even when COOP severs window.opener
        // while the popup navigates to Google's domain.
        let resultChannel = null;
        try {
            if (typeof window.BroadcastChannel === 'function') {
                resultChannel = new window.BroadcastChannel(`gm_google_oauth_${nonce}`);
            }
        } catch (_) {}

        // Open synchronously during the user's button click to avoid popup blockers.
        const popup = window.open('about:blank', `gmGoogleOAuth_${nonce}`, popupFeatures());
        if (!popup) {
            try { resultChannel?.close(); } catch (_) {}
            throw new Error('Jendela Google diblokir browser. Izinkan pop-up untuk situs Gemar Mengaji, lalu coba kembali.');
        }

        let started = false;
        let settled = false;
        let resolveResult;
        let rejectResult;
        let timeoutId = null;

        const resultPromise = new Promise((resolve, reject) => {
            resolveResult = resolve;
            rejectResult = reject;
        });

        function cleanup() {
            window.removeEventListener('message', onMessage);
            if (resultChannel) {
                try { resultChannel.removeEventListener('message', onChannelMessage); } catch (_) {}
                try { resultChannel.close(); } catch (_) {}
                resultChannel = null;
            }
            if (timeoutId !== null) window.clearTimeout(timeoutId);
            timeoutId = null;
        }

        function fail(error) {
            if (settled) return;
            settled = true;
            cleanup();
            rejectResult(error instanceof Error ? error : new Error(String(error || 'Login Google belum berhasil.')));
        }

        function succeed(value) {
            if (settled) return;
            settled = true;
            cleanup();
            resolveResult(value);
        }

        function handlePayload(data) {
            if (!data || data.type !== MESSAGE_TYPE || data.mode !== mode || data.nonce !== nonce) return;

            if (data.ok !== true) {
                const safeMessage = typeof data.message === 'string' && data.message.trim()
                    ? data.message.trim().slice(0, 260)
                    : 'Google belum berhasil memverifikasi akun. Silakan coba kembali.';
                fail(new Error(safeMessage));
                return;
            }

            if (!data.userId || (expectedUserId && data.userId !== expectedUserId)) {
                fail(new Error('Identitas akun berubah selama proses Google. Tidak ada perubahan akun yang diterapkan pada halaman ini.'));
                return;
            }

            succeed(data);
        }

        function onMessage(event) {
            if (event.origin !== window.location.origin || event.source !== popup) return;
            handlePayload(event.data);
        }

        function onChannelMessage(event) {
            // Random channel name and nonce/mode checks bind the response to this attempt.
            handlePayload(event.data);
        }

        window.addEventListener('message', onMessage);
        if (resultChannel) resultChannel.addEventListener('message', onChannelMessage);

        return {
            redirectTo: redirectTo.toString(),
            cancel() {
                if (started) {
                    fail(new Error('Proses autentikasi Google dibatalkan.'));
                } else {
                    settled = true;
                    cleanup();
                }
                try { if (!popup.closed) popup.close(); } catch (_) {}
            },
            async start(launch) {
                if (started) throw new Error('Proses pop-up Google ini sudah dimulai.');
                if (typeof launch !== 'function') throw new Error('Pemanggil autentikasi Google tidak tersedia.');
                started = true;

                timeoutId = window.setTimeout(() => {
                    fail(new Error('Verifikasi Google terlalu lama atau tidak mengirim hasil. Tutup pop-up, lalu coba kembali.'));
                }, POPUP_TIMEOUT_MS);

                try {
                    const response = await launch(redirectTo.toString());
                    if (response?.error) throw response.error;
                    const url = response?.data?.url;
                    if (!url || typeof url !== 'string') {
                        throw new Error('Alamat autentikasi Google tidak diterima dari Supabase.');
                    }
                    // Do not infer manual closure from popup.closed: COOP can make it
                    // return true even while the popup is navigating back to this origin.
                    popup.location.replace(url);
                    try { popup.focus(); } catch (_) {}
                    const result = await resultPromise;
                    try { if (!popup.closed) popup.close(); } catch (_) {}
                    return result;
                } catch (error) {
                    if (!settled) {
                        settled = true;
                        cleanup();
                    }
                    try { if (!popup.closed) popup.close(); } catch (_) {}
                    throw error instanceof Error ? error : new Error('Tidak dapat memulai autentikasi Google.');
                } finally {
                    cleanup();
                }
            }
        };
    }

    window.GMGoogleOAuthPopup = Object.freeze({ prepare });
})();