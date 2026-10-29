(() => {
    'use strict';

    // Experimental Google One Tap login. Existing Supabase OAuth popup remains the fallback.
    const GOOGLE_CLIENT_ID = '52115945693-33damctttbdg4rd28amci4jhc7gbekkf.apps.googleusercontent.com';
    const GIS_URL = 'https://accounts.google.com/gsi/client';
    const googleErrorDiv = document.getElementById('errorMessage');
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    const googleLoginText = googleLoginBtn?.querySelector('span');
    let initialized = false;
    let processing = false;

    function showError(message) {
        if (!googleErrorDiv) return;
        googleErrorDiv.textContent = message;
        googleErrorDiv.classList.remove('hidden');
    }

    function setBusy(busy) {
        processing = busy;
        if (googleLoginBtn) googleLoginBtn.disabled = busy;
        if (googleLoginText) {
            googleLoginText.textContent = busy ? 'Memproses Google...' : 'Masuk dengan Google';
        }
    }

    function randomNonce() {
        const bytes = new Uint8Array(32);
        window.crypto.getRandomValues(bytes);
        return btoa(String.fromCharCode(...bytes));
    }

    async function makeNoncePair() {
        if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
            throw new Error('Browser belum mendukung login Google yang aman. Gunakan tombol Masuk dengan Google di bawah.');
        }
        const nonce = randomNonce();
        const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
        const hashedNonce = Array.from(new Uint8Array(digest))
            .map(value => value.toString(16).padStart(2, '0')).join('');
        return { nonce, hashedNonce };
    }

    function loadGoogleIdentityServices() {
        return new Promise((resolve, reject) => {
            if (window.google?.accounts?.id) return resolve();
            const existing = document.querySelector('script[data-gm-google-identity]');
            if (existing) {
                existing.addEventListener('load', () => resolve(), { once: true });
                existing.addEventListener('error', () => reject(new Error('Layanan Google tidak dapat dimuat.')), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = GIS_URL;
            script.async = true;
            script.defer = true;
            script.dataset.gmGoogleIdentity = 'true';
            script.onload = () => window.google?.accounts?.id
                ? resolve()
                : reject(new Error('Layanan Google belum siap.'));
            script.onerror = () => reject(new Error('Layanan Google tidak dapat dimuat.'));
            document.head.appendChild(script);
        });
    }

    async function handleCredentialResponse(response, nonce) {
        if (processing || !response?.credential) return;
        setBusy(true);
        googleErrorDiv?.classList.add('hidden');

        try {
            const { data, error } = await window.supabase.auth.signInWithIdToken({
                provider: 'google',
                token: response.credential,
                nonce
            });
            if (error) throw error;

            const user = data?.user;
            if (!user?.id || !data?.session) {
                throw new Error('Sesi Google belum berhasil dibuat. Silakan gunakan tombol login biasa.');
            }

            const { data: access, error: accessError } = await window.supabase
                .from('user_roles')
                .select('role,teacher_id')
                .eq('user_id', user.id)
                .maybeSingle();

            if (accessError || !access || !['admin', 'koordinator', 'guru'].includes(access.role)
                || (access.role === 'guru' && !access.teacher_id)) {
                await window.supabase.auth.signOut({ scope: 'local' });
                throw new Error('Akun Google ini belum memiliki akses Gemar Mengaji. Gunakan akun yang sudah ditautkan oleh pengelola sekolah.');
            }

            try { sessionStorage.setItem('gm_login_transition', '1'); } catch (_) {}
            window.location.href = access.role === 'guru' ? 'guru.html' : 'admin.html';
        } catch (error) {
            const detail = String(error?.message || '').toLowerCase();
            let message = error?.message || 'Login Google belum berhasil. Silakan coba melalui tombol login biasa.';
            if (detail.includes('nonce')) {
                message = 'Verifikasi Google tidak cocok. Muat ulang halaman lalu coba kembali, atau gunakan tombol login biasa.';
            } else if (detail.includes('invalid') && detail.includes('token')) {
                message = 'Token Google tidak dapat diverifikasi. Gunakan tombol login biasa atau muat ulang halaman.';
            }
            showError(message);
            setBusy(false);
        }
    }

    async function initOneTap() {
        if (initialized || !window.supabase || !googleErrorDiv || !googleLoginBtn) return;
        initialized = true;

        try {
            const { data: sessionData, error: sessionError } = await window.supabase.auth.getSession();
            if (sessionError) throw sessionError;
            // Do not show another identity prompt when this browser already has a session.
            if (sessionData?.session?.user) return;

            const [{ nonce, hashedNonce }] = [await makeNoncePair()];
            await loadGoogleIdentityServices();

            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                nonce: hashedNonce,
                callback: response => handleCredentialResponse(response, nonce),
                auto_select: false,
                cancel_on_tap_outside: true,
                context: 'signin',
                itp_support: true
            });

            // Google controls whether and where One Tap can appear; the ordinary button remains as fallback.
            window.google.accounts.id.prompt();
        } catch (_) {
            // Keep login usable if One Tap is unavailable, blocked, or the origin is not authorized.
        }
    }

    window.GMGoogleOneTap = Object.freeze({
        cancel() {
            try { window.google?.accounts?.id?.cancel(); } catch (_) {}
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initOneTap, { once: true });
    } else {
        initOneTap();
    }
})();