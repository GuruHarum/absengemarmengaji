window.AccountProfile = (() => {
    const el = id => document.getElementById(id);
    let selectedPhoto = null;
    let previewUrl = null;
    let savedUsername = '';
    let usernameBusy = false;

    const message = (text, error = false, feedbackId = 'profileFeedback') => {
        const main = el('profileFeedback');
        if (main) {
            main.dataset.feedbackError = String(error);
            main.textContent = text;
            // Pertahankan status global untuk kompatibilitas, tampilkan pesan aksi di dekat formulir.
            main.hidden = feedbackId !== 'profileFeedback';
        }
        if (feedbackId !== 'profileFeedback') {
            const local = el(feedbackId);
            if (local) {
                local.dataset.feedbackError = String(error);
                local.textContent = text;
                local.hidden = !text;
            }
        }
    };

    const clean = value => String(value || '').trim();
    const displayName = () => clean(AppAccess.profile?.displayName) || clean(AppAccess.profile?.teacherName) || (AppAccess.profile?.role === 'koordinator' ? 'Koordinator' : AppAccess.profile?.role === 'admin' ? 'Admin' : 'Guru');
    const initials = value => {
        const parts = clean(value).replace(/[,._-]+/g, ' ').split(/\s+/).filter(Boolean);
        if (!parts.length) return 'A';
        return `${parts[0][0] || ''}${parts.length > 1 ? parts.at(-1)[0] || '' : ''}`.toUpperCase().slice(0, 2);
    };

    function setAvatar(img, fallback, photo, name) {
        if (!img || !fallback) return;
        fallback.textContent = initials(name);
        if (photo) {
            img.hidden = false;
            fallback.hidden = true;
            img.src = photo;
            img.onerror = () => {
                img.hidden = true;
                fallback.hidden = false;
                img.removeAttribute('src');
            };
        } else {
            img.hidden = true;
            fallback.hidden = false;
            img.removeAttribute('src');
        }
    }

    function renderHeader() {
        const name = displayName();
        const headerName = el('headerProfileName');
        if (headerName) headerName.textContent = name;
        setAvatar(el('headerProfilePhoto'), el('headerProfileInitials'), AppAccess.profile?.teacherPhoto, name);
    }

    function renderPhotoProfile() {
        const profile = AppAccess.profile || {};
        const linked = Boolean(profile.teacher_id && profile.teacherName);
        const tahsinPhotoAllowed = linked && profile.attendanceEnabled !== false;
        const photo = previewUrl || profile.teacherPhoto || null;
        const name = displayName();
        setAvatar(el('profilePhotoPreview'), el('profilePhotoInitials'), photo, name);

        const teacherName = el('profileTeacherName');
        const teacherMeta = el('profileTeacherMeta');
        const actions = el('profilePhotoActions');
        const fileInput = el('profilePhotoFile');
        const save = el('profilePhotoSave');
        const remove = el('profilePhotoRemove');
        const hint = el('profilePhotoHint');

        if (teacherName)
            teacherName.textContent = linked ? (profile.teacherFullName || profile.teacherName) : name;
        if (teacherMeta)
            teacherMeta.textContent = linked
                ? (tahsinPhotoAllowed ? `Terhubung dengan data guru: ${profile.teacherName}` : `Terhubung dengan data guru: ${profile.teacherName} · khusus Tahfidz`)
                : 'Akun ini belum tertaut dengan data guru.';
        if (actions) actions.hidden = !tahsinPhotoAllowed;
        if (fileInput) fileInput.disabled = !tahsinPhotoAllowed;
        if (save) save.disabled = !selectedPhoto || !tahsinPhotoAllowed;
        if (remove) remove.hidden = !profile.teacherPhoto || !tahsinPhotoAllowed;
        if (hint) hint.textContent = tahsinPhotoAllowed
            ? 'JPG, PNG atau WebP. Maksimal 2 MB. Foto yang disimpan akan langsung dipakai pada header dan halaman terkait.'
            : linked ? 'Foto profil tidak digunakan untuk guru khusus Tahfidz.' : 'Foto dapat diubah setelah akun ditautkan dengan data guru.';
    }

    function clearPreview() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        selectedPhoto = null;
        const input = el('profilePhotoFile');
        if (input) input.value = '';
    }

    function renderUsernameActions() {
        const remove = el('profileUsernameRemove');
        const save = el('profileUsernameSave');
        if (remove) {
            remove.hidden = !savedUsername;
            remove.disabled = usernameBusy;
        }
        if (save) save.disabled = usernameBusy;
    }

    async function refreshTeacher() {
        if (!AppAccess.profile?.teacher_id) return null;
        const row = await AppAccess.loadTeacherProfile();
        renderHeader();
        renderPhotoProfile();
        return row;
    }

    async function open() {
        showProfileSection(AppAccess.profile?.temporaryPassword ? 'security' : (el('page-profil')?.dataset.profileSection || 'account'));
        try {
            for (const id of ['profilePhotoFeedback', 'profileIdentityFeedback', 'profileUsernameFeedback', 'profilePasswordFeedback']) {
                const feedback = el(id);
                if (feedback) {
                    feedback.hidden = true;
                    feedback.textContent = '';
                }
            }
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user)
                throw error || new Error('Silakan masuk kembali.');
            AppAccess.profile.email = data.user.email || '';
            AppAccess.profile.displayName = clean(data.user.user_metadata?.full_name);
            el('profileEmail').value = data.user.email || '';
            if (el('profileUsername')) {
                const { data: username, error: usernameError } = await supabase.rpc('gm_my_login_username');
                if (!usernameError) {
                    savedUsername = clean(username);
                    el('profileUsername').value = savedUsername;
                } else {
                    savedUsername = '';
                    el('profileUsername').value = '';
                }
                renderUsernameActions();
            }
            el('profileName').value = AppAccess.profile.displayName || '';
            clearPreview();
            if (AppAccess.profile.teacher_id)
                await refreshTeacher();
            else {
                renderHeader();
                renderPhotoProfile();
            }
            message(data.user.user_metadata?.temporary_password ? 'Anda memakai password sementara. Silakan ubah password di bagian keamanan akun.' : 'Profil Anda sudah dimuat.');
        }
        catch (error) {
            message(error.message, true);
        }
    }

    async function submit(form, action, feedbackId = 'profileFeedback') {
        const button = form.querySelector('button[type="submit"]');
        if (button?.disabled || (form.id === 'profileUsernameForm' && usernameBusy)) return;
        if (button) button.disabled = true;
        if (form.id === 'profileUsernameForm') {
            usernameBusy = true;
            renderUsernameActions();
        }
        try {
            await action();
        }
        catch (error) {
            message(error.message || 'Gagal memperbarui akun.', true, feedbackId);
        }
        finally {
            if (button) button.disabled = false;
            if (form.id === 'profileUsernameForm') {
                usernameBusy = false;
                renderUsernameActions();
            }
        }
    }

    function currentTeacherRecord() {
        const p = AppAccess.profile || {};
        if (!p.teacher_id || !p.teacherName) return null;
        return {
            id: p.teacher_id,
            nama: p.teacherName,
            nama_lengkap: p.teacherFullName,
            attendance_enabled: p.attendanceEnabled,
            foto: p.teacherPhoto,
            foto_storage_path: p.teacherPhotoPath
        };
    }

    function updateTeacherState(saved) {
        if (!saved) return;
        AppAccess.profile.teacherName = saved.nama || AppAccess.profile.teacherName;
        AppAccess.profile.teacherFullName = saved.nama_lengkap || saved.nama || AppAccess.profile.teacherFullName;
        AppAccess.profile.teacherPhoto = saved.foto || null;
        AppAccess.profile.teacherPhotoPath = saved.foto_storage_path || null;
        AppAccess.profile.attendanceEnabled = saved.attendance_enabled;
        if (typeof teachersData !== 'undefined' && Array.isArray(teachersData)) {
            teachersData = teachersData.map(row => String(row.id) === String(saved.id) ? { ...row, ...saved } : row);
        }
        renderHeader();
        renderPhotoProfile();
    }

    async function savePhoto() {
        const teacher = currentTeacherRecord();
        if (!teacher) return message('Akun belum tertaut dengan data guru.', true, 'profilePhotoFeedback');
        if (!selectedPhoto) return message('Pilih foto terlebih dahulu.', true, 'profilePhotoFeedback');
        const button = el('profilePhotoSave');
        if (button) button.disabled = true;
        try {
            const saved = await TeacherPhoto.save(teacher, selectedPhoto);
            clearPreview();
            updateTeacherState(saved);
            message('Foto profil berhasil diperbarui.', false, 'profilePhotoFeedback');
        }
        catch (error) {
            message(error.message || 'Foto profil gagal diperbarui.', true, 'profilePhotoFeedback');
        }
        finally {
            renderPhotoProfile();
        }
    }

    async function removePhoto() {
        const teacher = currentTeacherRecord();
        if (!teacher?.foto) return;
        const question = 'Hapus foto profil ini? Foto yang tersimpan akan dihapus dan avatar kembali memakai inisial.';
        const approved = window.AdminNotice?.confirm
            ? await window.AdminNotice.confirm(question)
            : await window.confirm?.(question);
        if (!approved) return;
        const button = el('profilePhotoRemove');
        if (button) button.disabled = true;
        try {
            const saved = await TeacherPhoto.remove(teacher);
            clearPreview();
            updateTeacherState(saved);
            message('Foto profil berhasil dihapus.', false, 'profilePhotoFeedback');
        }
        catch (error) {
            message(error.message || 'Foto profil gagal dihapus.', true, 'profilePhotoFeedback');
        }
        finally {
            if (button) button.disabled = false;
            renderPhotoProfile();
        }
    }

    function setUnread(count = 0) {
        const unread = Math.max(0, Number(count) || 0);
        const badge = el('notificationBadge');
        const label = el('notificationCountLabel');
        if (badge) badge.hidden = unread < 1;
        if (label) label.textContent = unread ? `${unread} belum dilihat` : 'Belum ada yang baru';
    }

    function renderNotifications(items = []) {
        const list = el('notificationList');
        if (!list) return;
        if (!items.length) {
            list.innerHTML = '<div class="admin-notification-empty"><span aria-hidden="true">✓</span><strong>Belum ada notifikasi</strong></div>';
            setUnread(0);
            return;
        }
        const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c]));
        list.innerHTML = items.map(item => `<button type="button" class="admin-notification-item ${item.seen_at ? '' : 'is-unseen'} ${item.read_at ? '' : 'is-unread'}" data-notification-id="${esc(item.id)}">
            <span class="admin-notification-title"><strong>${esc(item.title || 'Notifikasi')}</strong>${item.seen_at ? '' : '<i aria-hidden="true"></i>'}</span>
            <span>${esc(item.message || '')}</span>
            <small>${esc(item.time_label || '')}</small>
        </button>`).join('');
        setUnread(items.filter(item => !item.seen_at).length);
    }

    function showProfileSection(name='account') {
        const wrapper=el('page-profil');
        if (!wrapper) return;
        const section=name==='security'?'security':'account';
        wrapper.dataset.profileSection=section;
        wrapper.querySelectorAll('[data-profile-tab]').forEach(button=>{
            const active=button.dataset.profileTab===section;
            button.classList.toggle('active',active);
            button.setAttribute('aria-selected',String(active));
            button.tabIndex=active?0:-1;
        });
    }
    function setupHeader() {
        el('page-profil')?.querySelectorAll('[data-profile-tab]').forEach(button=>button.addEventListener('click',()=>showProfileSection(button.dataset.profileTab)));
        renderHeader();
        el('headerProfileBtn')?.addEventListener('click', () => switchPage('profil'));
        const bell = el('notificationBellBtn');
        const popover = el('notificationPopover');
        bell?.addEventListener('click', event => {
            event.stopPropagation();
            const opening = popover?.hidden !== false;
            if (popover) popover.hidden = !opening;
            bell.setAttribute('aria-expanded', String(opening));
            if (opening) {
                setUnread(0);
                void window.GMNotifications?.markSeen?.();
            }
        });
        document.addEventListener('click', event => {
            if (!popover || popover.hidden || event.target.closest?.('.admin-notification-wrap')) return;
            popover.hidden = true;
            bell?.setAttribute('aria-expanded', 'false');
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !popover || popover.hidden) return;
            popover.hidden = true;
            bell?.setAttribute('aria-expanded', 'false');
            bell?.focus();
        });
        el('notificationList')?.addEventListener('click', event => {
            const item = event.target.closest?.('.admin-notification-item');
            const notificationId = item?.dataset?.notificationId;
            if (notificationId && window.GMNotifications?.openNotification)
                void window.GMNotifications.openNotification(notificationId);
        });
        setUnread(0);
    }

    ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready', callback))( () => {
        setupHeader();
        renderPhotoProfile();
        renderUsernameActions();

        el('profilePhotoFile')?.addEventListener('change', event => {
            const file = event.target.files?.[0];
            if (!file) {
                clearPreview();
                renderPhotoProfile();
                return;
            }
            try {
                TeacherPhoto.validate(file);
            }
            catch (error) {
                clearPreview();
                renderPhotoProfile();
                return message(error.message, true, 'profilePhotoFeedback');
            }
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            selectedPhoto = file;
            previewUrl = URL.createObjectURL(file);
            renderPhotoProfile();
            message('Foto siap disimpan.', false, 'profilePhotoFeedback');
        });
        el('profilePhotoSave')?.addEventListener('click', savePhoto);
        el('profilePhotoRemove')?.addEventListener('click', removePhoto);

        el('profileForm')?.addEventListener('submit', event => {
            event.preventDefault();
            return submit(event.target, async () => {
                const name = el('profileName').value.trim();
                const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
                if (error) throw error;
                AppAccess.profile.displayName = name;
                renderHeader();
                window.GMUpgrade?.refreshIdentity?.();
                message('Nama profil disimpan.', false, 'profileIdentityFeedback');
            }, 'profileIdentityFeedback');
        });

        el('profileUsernameForm')?.addEventListener('submit', event => {
            event.preventDefault();
            return submit(event.target, async () => {
                const username = el('profileUsername').value.trim().toLowerCase();
                if (!username) throw new Error('Untuk menghapus username yang tersimpan, gunakan tombol Hapus Username.');
                const { data, error } = await supabase.rpc('gm_set_login_username', { new_username: username });
                if (error) throw error;
                savedUsername = data || '';
                el('profileUsername').value = savedUsername;
                renderUsernameActions();
                message('Username berhasil disimpan. Login berikutnya dapat memakai username atau email.', false, 'profileUsernameFeedback');
            }, 'profileUsernameFeedback');
        });
        el('profileUsernameRemove')?.addEventListener('click', async () => {
            if (!savedUsername || usernameBusy) return;
            const question = 'Hapus username login? Setelah dihapus, Anda tetap dapat masuk menggunakan email dan password akun.';
            const approved = window.AdminNotice?.confirm
                ? await window.AdminNotice.confirm(question)
                : await window.confirm?.(question);
            if (!approved) return;
            usernameBusy = true;
            renderUsernameActions();
            try {
                const { data, error } = await supabase.rpc('gm_set_login_username', { new_username: '' });
                if (error) throw error;
                if (data !== '') throw new Error('Penghapusan username belum terkonfirmasi.');
                savedUsername = '';
                el('profileUsername').value = '';
                message('Username berhasil dihapus. Login menggunakan email tetap tersedia.', false, 'profileUsernameFeedback');
            } catch (error) {
                message(error.message || 'Username belum dapat dihapus.', true, 'profileUsernameFeedback');
            } finally {
                usernameBusy = false;
                renderUsernameActions();
            }
        });
        el('passwordForm')?.addEventListener('submit', event => {
            event.preventDefault();
            return submit(event.target, async () => {
                const password = el('profilePassword').value;
                if (!password)
                    throw new Error('Password tidak boleh kosong.');
                if (password !== el('profileConfirm').value)
                    throw new Error('Konfirmasi password tidak sama.');
                const nonce = el('profileNonce').value.trim();
                const { error } = await supabase.auth.updateUser({ password, ...(nonce ? { nonce } : {}), data: { temporary_password: false } });
                if (error) throw error;
                event.target.reset();
                AppAccess.profile.temporaryPassword = false;
                message('Password berhasil diubah. Gunakan password baru saat masuk berikutnya.', false, 'profilePasswordFeedback');
            }, 'profilePasswordFeedback');
        });

        el('profileReauthenticate')?.addEventListener('click', async event => {
            event.target.disabled = true;
            try {
                const { error } = await supabase.auth.reauthenticate();
                if (error) throw error;
                message('Kode verifikasi dikirim ke kontak akun Anda. Masukkan kode, lalu ubah password.', false, 'profilePasswordFeedback');
            }
            catch (error) {
                message(error.message, true, 'profilePasswordFeedback');
            }
            finally {
                event.target.disabled = false;
            }
        });
    });

    return { open, renderHeader, refreshTeacher, setUnread, renderNotifications };
})();
