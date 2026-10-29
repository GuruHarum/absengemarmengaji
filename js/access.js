window.AppAccess = (() => {
    let profile = null;
    const full = () => ['admin', 'koordinator'].includes(profile?.role);
    const teacher = () => profile?.role === 'guru';
    const linkedTeacher = () => Boolean(profile?.teacher_id && profile?.teacherName);
    const canPage = page => ['rapor','laporan','arsip','pengaturan','identitas','maintenance','analitik','presentasi'].includes(page) ? profile?.role === 'koordinator' : page === 'dashboard' ? Boolean(profile) : full() || (teacher() && ['absensi','kelola','kelompok','kelompok-tahsin','penilaian','profil'].includes(page) && (page !== 'absensi' || profile.attendanceEnabled !== false));

    async function loadTeacherProfile() {
        if (!profile?.teacher_id)
            return null;
        const { data: row, error } = await supabase.from('teachers')
            .select('id,nama,nama_lengkap,attendance_enabled,foto,foto_storage_path')
            .eq('id', profile.teacher_id).single();
        if (error || !row) {
            if (teacher())
                throw new Error('Akun guru belum terhubung dengan data guru yang valid.');
            profile.teacherName = null;
            profile.teacherFullName = null;
            profile.teacherPhoto = null;
            profile.teacherPhotoPath = null;
            return null;
        }
        profile.teacherName = row.nama;
        profile.teacherFullName = row.nama_lengkap || row.nama;
        profile.teacherPhoto = row.foto || null;
        profile.teacherPhotoPath = row.foto_storage_path || null;
        profile.attendanceEnabled = row.attendance_enabled;
        return row;
    }

    async function getVerifiedUser() {
        // OAuth popup and dashboard are separate tabs. On a first Google login,
        // allow the shared Supabase session a short moment to become visible here.
        // The login page sets this sessionStorage flag before navigating here.
        // Checking a CSS class was ineffective because no page adds that class.
        let isLoginTransition = false;
        try {
            isLoginTransition = sessionStorage.getItem('gm_login_transition') === '1';
        } catch (_) {}
        const attempts = isLoginTransition ? 16 : 1;
        let lastError = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                const { data, error } = await supabase.auth.getUser();
                if (!error && data?.user) return data.user;
                lastError = error;
            } catch (error) {
                lastError = error;
            }
            if (attempt + 1 < attempts) {
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
        throw new Error(lastError?.message || 'Sesi login belum tersedia. Silakan kembali ke halaman login dan coba lagi.');
    }

    const ready = (async () => {
        const user = await getVerifiedUser();
        const result = await supabase.from('user_roles').select('role,teacher_id').eq('user_id', user.id).maybeSingle();
        if (result.error)
            throw new Error('Pengaturan hak akses belum tersedia. Hubungi koordinator.');
        if (!result.data || !['admin', 'koordinator', 'guru'].includes(result.data.role))
            throw new Error('Akun belum diberi hak akses. Hubungi koordinator.');
        profile = result.data;
        profile.userId = user.id;
        profile.email = user.email || '';
        profile.displayName = String(user.user_metadata?.full_name || '').trim();
        profile.temporaryPassword = Boolean(user.user_metadata?.temporary_password);
        await loadTeacherProfile();
        if (teacher() && !profile.teacherName)
            throw new Error('Akun guru belum terhubung dengan data guru yang valid.');
        try { sessionStorage.removeItem('gm_login_transition'); } catch (_) {}
        return profile;
    })();

    function scope(query, table) {
        if (!profile)
            throw new Error('Hak akses belum siap.');
        if (!teacher())
            return query;
        if (table === 'teachers')
            return query.eq('id', profile.teacher_id);
        if (table === 'students')
            return query.eq('nama guru', profile.teacherName);
        if (table === 'attendance')
            return query.eq('teacher', profile.teacherName);
        return query;
    }

    function applyUI() {
        document.body.dataset.role = profile.role;
        const badge = document.getElementById('accountRole');
        if (badge)
            badge.textContent = teacher() ? `Guru · ${profile.teacherName}` :
                (profile.role === 'koordinator' ? (linkedTeacher() ? `Koordinator · ${profile.teacherName}` : 'Koordinator') : 'Admin');
        ['dashboard','rapor','laporan','arsip','analitik','presentasi','kelompok','kelompok-tahsin','absensi','infografik','identitas','pengaturan','maintenance'].forEach(page => {
            const item = document.getElementById(`menu-${page}`);
            if (item)
                item.hidden = !canPage(page);
        });
        document.documentElement.style.visibility = 'visible';
    }

    function deny(error) {
        document.documentElement.style.visibility = 'visible';
        const section = document.createElement('main');
        section.className = 'access-error';
        const title = document.createElement('h1');
        title.textContent = 'Akses akun diperlukan';
        const message = document.createElement('p');
        message.textContent = error.message;
        const login = document.createElement('a');
        login.href = 'login.html';
        login.textContent = 'Ke halaman login';
        section.append(title, message, login);
        document.body.replaceChildren(section);
    }

    ready.catch(error => {
        try { sessionStorage.removeItem('gm_login_transition'); } catch (_) {}
        profile = null;
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => deny(error), { once: true });
        else
            deny(error);
    });

    return { ready, full, teacher, linkedTeacher, canPage, scope, applyUI, loadTeacherProfile, get profile() { return profile; } };
})();
