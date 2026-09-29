window.GMNotifications = (() => {
    const state = { items: [], loading: false, timer: null };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function timeLabel(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
        if (seconds < 45) return 'Baru saja';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
        if (seconds < 172800) return 'Kemarin';
        return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
    }


    function syncAppBadge(items = state.items) {
        const count = (items || []).filter(item => !item.seen_at).length;
        try {
            if (count > 0 && typeof navigator.setAppBadge === 'function') navigator.setAppBadge(count);
            else if (typeof navigator.clearAppBadge === 'function') navigator.clearAppBadge();
        } catch (_) {}
    }

    function decorated(items) {
        return (items || []).map(item => ({ ...item, time_label: timeLabel(item.created_at) }));
    }

    async function load({ silent = true } = {}) {
        if (state.loading || !AppAccess.profile?.userId) return state.items;
        state.loading = true;
        try {
            const { data, error } = await supabase.rpc('gm_my_notifications', { limit_key: 30 });
            if (error) throw error;
            state.items = decorated(data || []);
            AccountProfile?.renderNotifications?.(state.items);
            syncAppBadge(state.items);
            return state.items;
        } catch (error) {
            console.error('Notifikasi internal gagal dimuat:', error);
            if (!silent) AdminNotice?.notify?.('Notifikasi belum dapat dimuat.', 'error');
            return state.items;
        } finally {
            state.loading = false;
        }
    }

    async function markSeen() {
        const unseen = state.items.filter(item => !item.seen_at);
        if (!unseen.length) {
            AccountProfile?.setUnread?.(0);
            syncAppBadge([]);
            return 0;
        }
        const now = new Date().toISOString();
        state.items = state.items.map(item => item.seen_at ? item : { ...item, seen_at: now });
        AccountProfile?.renderNotifications?.(state.items);
        syncAppBadge(state.items);
        const { data, error } = await supabase.rpc('gm_mark_notifications_seen');
        if (error) {
            console.error('Status notifikasi seen gagal disimpan:', error);
            void load();
            return 0;
        }
        return Number(data || 0);
    }

    async function focusAttention() {
        switchPage('dashboard');
        for (let i = 0; i < 20; i++) {
            if (window.GMAttention?.focusScores?.()) return true;
            await sleep(60);
        }
        return false;
    }

    async function openNotification(id) {
        const item = state.items.find(row => String(row.id) === String(id));
        if (!item) return;
        const now = new Date().toISOString();
        state.items = state.items.map(row => String(row.id) === String(id) ? { ...row, seen_at: row.seen_at || now, read_at: row.read_at || now } : row);
        AccountProfile?.renderNotifications?.(state.items);
        syncAppBadge(state.items);
        const { error } = await supabase.rpc('gm_mark_notification_read', { notification_key: Number(id) });
        if (error) console.error('Status notifikasi read gagal disimpan:', error);
        const popover = document.getElementById('notificationPopover');
        if (popover) popover.hidden = true;
        document.getElementById('notificationBellBtn')?.setAttribute('aria-expanded', 'false');
        if (item.target_page === 'dashboard' && item.payload?.attention_filter === 'scores') {
            await focusAttention();
            return;
        }
        if (item.target_page && typeof switchPage === 'function') switchPage(item.target_page);
    }

    async function sendAttention(teacherId, options = {}) {
        if (AppAccess.profile?.role !== 'koordinator') return;
        const teacherName = options.teacherName || 'guru ini';
        const studentCount = Number(options.studentCount || 0);
        const confirmed = await AdminNotice.confirm(`Kirim pengingat nilai kepada ${teacherName}${studentCount ? ` untuk ${studentCount} siswa` : ''}?`);
        if (!confirmed) return;
        const { data, error } = await supabase.rpc('gm_send_attention_notification', {
            teacher_key: String(teacherId),
            year_key: Number(options.year || getPublicAcademicYearStart()),
            period_key: options.period || null
        });
        if (error) throw error;
        const result = data || {};
        if (result.status === 'sent') {
            const push = await window.GMPush?.dispatch?.(result.notification_ids || []);
            result.push = push || { status: 'not_requested' };
            const name = result.teacher_name || teacherName;
            if (push?.status === 'sent') AdminNotice.notify(`Pengingat terkirim ke ${name} · Push terkirim.`, 'success');
            else if (push?.status === 'partial') AdminNotice.notify(`Pengingat terkirim ke ${name} · Push terkirim ke sebagian perangkat.`, 'success');
            else if (push?.status === 'no_subscription') AdminNotice.notify(`Pengingat terkirim ke ${name} · Push belum aktif.`, 'success');
            else AdminNotice.notify(`Pengingat internal terkirim ke ${name}.`, 'success');
            return result;
        }
        if (result.status === 'recent') {
            AdminNotice.notify(`Pengingat untuk ${result.teacher_name || teacherName} baru saja dikirim.`, 'info');
            return result;
        }
        if (result.status === 'no_account') {
            AdminNotice.notify(`${result.teacher_name || teacherName} belum memiliki akun yang tertaut.`, 'error');
            return result;
        }
        if (result.status === 'no_issues') {
            AdminNotice.notify(`Nilai ${result.teacher_name || teacherName} sudah lengkap untuk periode ini.`, 'info');
            return result;
        }
        AdminNotice.notify('Pengingat belum dapat dikirim.', 'error');
        return result;
    }

    function startPolling() {
        clearInterval(state.timer);
        state.timer = setInterval(() => {
            if (document.visibilityState === 'visible') void load();
        }, 60000);
    }

    document.addEventListener('panelready', () => {
        void load({ silent: true });
        startPolling();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void load({ silent: true });
        });
    });

    return { load, markSeen, openNotification, sendAttention, syncAppBadge, get items() { return [...state.items]; } };
})();
