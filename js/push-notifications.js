window.GMPush = (() => {
    const state = { publicKey: null, registration: null, subscription: null, syncing: false };
    const el = id => document.getElementById(id);
    const supported = () => Boolean(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    const linkedTeacher = () => Boolean(AppAccess.profile?.teacher_id);

    function decodeBase64Url(value) {
        const padding = '='.repeat((4 - value.length % 4) % 4);
        const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
    }

    async function getRegistration() {
        if (!supported()) return null;
        state.registration ||= await navigator.serviceWorker.ready;
        return state.registration;
    }

    async function getPublicKey() {
        if (state.publicKey) return state.publicKey;
        const { data, error } = await supabase.functions.invoke('push-notifications', { body: { action: 'config' } });
        if (error) throw new Error(data?.error || error.message || 'Konfigurasi Web Push belum tersedia');
        const key = String(data?.vapid_public_key || '').trim();
        if (!key) throw new Error('Kunci Web Push belum tersedia');
        state.publicKey = key;
        return key;
    }

    function profileStatus(text, tone = '') {
        const status = el('profilePushStatus');
        if (!status) return;
        status.textContent = text;
        status.dataset.tone = tone;
    }

    function renderProfile() {
        const card = el('profilePushCard');
        const enable = el('profilePushEnable');
        const disable = el('profilePushDisable');
        if (!card) return;
        card.hidden = !linkedTeacher();
        if (card.hidden) return;

        if (!supported()) {
            profileStatus('Tidak didukung di perangkat ini', 'muted');
            if (enable) enable.hidden = true;
            if (disable) disable.hidden = true;
            return;
        }

        const permission = Notification.permission;
        const active = Boolean(state.subscription);
        profileStatus(active ? 'Aktif di perangkat ini' : permission === 'denied' ? 'Diblokir oleh browser' : 'Belum aktif', active ? 'active' : permission === 'denied' ? 'blocked' : '');
        if (enable) {
            enable.hidden = active || permission === 'denied';
            enable.disabled = state.syncing;
        }
        if (disable) {
            disable.hidden = !active;
            disable.disabled = state.syncing;
        }
    }

    async function registerSubscription(subscription) {
        const json = subscription?.toJSON?.() || {};
        const endpoint = String(json.endpoint || subscription?.endpoint || '');
        const p256dh = String(json.keys?.p256dh || '');
        const auth = String(json.keys?.auth || '');
        if (!endpoint || !p256dh || !auth) throw new Error('Subscription perangkat tidak lengkap');
        const { error } = await supabase.rpc('gm_register_push_subscription', {
            endpoint_key: endpoint,
            p256dh_key: p256dh,
            auth_key_value: auth,
            user_agent_key: navigator.userAgent || ''
        });
        if (error) throw error;
    }

    async function syncExisting({ quiet = true } = {}) {
        if (!supported() || !linkedTeacher() || state.syncing) {
            renderProfile();
            return state.subscription;
        }
        state.syncing = true;
        try {
            const registration = await getRegistration();
            state.subscription = await registration.pushManager.getSubscription();
            if (state.subscription && Notification.permission === 'granted') await registerSubscription(state.subscription);
            renderProfile();
            return state.subscription;
        } catch (error) {
            console.error('Sinkronisasi Web Push gagal:', error);
            if (!quiet) AdminNotice?.notify?.('Status push belum dapat diperbarui.', 'error');
            renderProfile();
            return null;
        } finally {
            state.syncing = false;
            renderProfile();
        }
    }

    async function enable({ quiet = false } = {}) {
        if (!supported()) { if (!quiet) AdminNotice?.notify?.('Push tidak didukung di perangkat ini.', 'info'); return null; }
        if (!linkedTeacher()) { if (!quiet) AdminNotice?.notify?.('Akun belum tertaut dengan data guru.', 'info'); return null; }
        state.syncing = true;
        renderProfile();
        try {
            const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
            if (permission !== 'granted') {
                renderProfile();
                if (!quiet) AdminNotice?.notify?.('Izin notifikasi belum diberikan.', 'info');
                return null;
            }
            const registration = await getRegistration();
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                const publicKey = await getPublicKey();
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: decodeBase64Url(publicKey)
                });
            }
            await registerSubscription(subscription);
            state.subscription = subscription;
            if (!quiet) AdminNotice?.notify?.('Notifikasi perangkat aktif.', 'success');
        } catch (error) {
            console.error('Aktivasi Web Push gagal:', error);
            if (!quiet) AdminNotice?.notify?.('Notifikasi perangkat belum dapat diaktifkan.', 'error');
        } finally {
            state.syncing = false;
            renderProfile();
        }
    }

    async function disable() {
        if (!state.subscription) return;
        state.syncing = true;
        renderProfile();
        try {
            const endpoint = state.subscription.endpoint;
            const { error } = await supabase.rpc('gm_remove_push_subscription', { endpoint_key: endpoint });
            if (error) throw error;
            await state.subscription.unsubscribe();
            state.subscription = null;
            AdminNotice?.notify?.('Notifikasi perangkat dinonaktifkan.', 'success');
        } catch (error) {
            console.error('Nonaktif Web Push gagal:', error);
            AdminNotice?.notify?.('Notifikasi perangkat belum dapat dinonaktifkan.', 'error');
        } finally {
            state.syncing = false;
            renderProfile();
        }
    }

    async function dispatch(notificationIds = []) {
        const ids = [...new Set((notificationIds || []).map(Number).filter(Number.isSafeInteger))];
        if (!ids.length) return { status: 'not_requested', sent: 0, failed: 0, no_subscription: 0 };
        try {
            const { data, error } = await supabase.functions.invoke('push-notifications', {
                body: { action: 'send', notification_ids: ids }
            });
            if (error) throw new Error(data?.error || error.message || 'Push gagal dikirim');
            return data || { status: 'failed', sent: 0, failed: 0, no_subscription: 0 };
        } catch (error) {
            console.error('Pengiriman Web Push gagal:', error);
            return { status: 'failed', sent: 0, failed: ids.length, no_subscription: 0 };
        }
    }

    async function openNotificationFromOutside(id) {
        if (!id) return;
        for (let i = 0; i < 30; i++) {
            if (window.GMNotifications?.load && window.GMNotifications?.openNotification) {
                await window.GMNotifications.load({ silent: true });
                await window.GMNotifications.openNotification(String(id));
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    function handleDeepLink() {
        const params = new URLSearchParams(location.search);
        const notificationId = params.get('notification');
        if (!notificationId) return;
        history.replaceState({}, document.title, location.pathname + location.hash);
        void openNotificationFromOutside(notificationId);
    }

    document.addEventListener('panelready', () => {
        el('profilePushEnable')?.addEventListener('click', () => enable());
        el('profilePushDisable')?.addEventListener('click', disable);
        if (window.GM_PUSH_BOOT_PERMISSION === 'granted') {
            void enable({ quiet: window.GM_PUSH_BOOT_QUIET !== false });
            window.GM_PUSH_BOOT_PERMISSION = null;
        } else {
            void syncExisting({ quiet: true });
        }
        handleDeepLink();
    });

    navigator.serviceWorker?.addEventListener?.('message', event => {
        if (event.data?.type === 'OPEN_NOTIFICATION' && event.data?.notificationId)
            void openNotificationFromOutside(event.data.notificationId);
    });

    return { enable, disable, syncExisting, dispatch, renderProfile, get active() { return Boolean(state.subscription); } };
})();
