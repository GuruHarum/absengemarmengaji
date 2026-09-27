window.AppAccess = (() => {
    let profile = null;
    const full = () => ['admin', 'koordinator'].includes(profile?.role);
    const teacher = () => profile?.role === 'guru';
    const canPage = page => page === 'rapor' ? profile?.role === 'koordinator' : full() || (teacher() && ['absensi', 'kelola', 'penilaian', 'profil'].includes(page) && (page !== 'absensi' || profile.attendanceEnabled !== false));
    const ready = (async () => {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user)
            throw new Error('Silakan masuk untuk mengakses data sekolah.');
        const result = await supabase.from('user_roles').select('role,teacher_id').eq('user_id', data.user.id).maybeSingle();
        if (result.error)
            throw new Error('Pengaturan hak akses belum tersedia. Hubungi koordinator.');
        if (!result.data || !['admin', 'koordinator', 'guru'].includes(result.data.role))
            throw new Error('Akun belum diberi hak akses. Hubungi koordinator.');
        profile = result.data;
        profile.temporaryPassword = Boolean(data.user.user_metadata?.temporary_password);
        if (profile.teacher_id) {
            const { data: row, error: teacherError } = await supabase.from('teachers').select('id,nama,attendance_enabled').eq('id', profile.teacher_id).single();
            if (teacherError || !row) {
                if (teacher())
                    throw new Error('Akun guru belum terhubung dengan data guru yang valid.');
            }
            else {
                profile.teacherName = row.nama;
                profile.attendanceEnabled = row.attendance_enabled;
            }
        }
        if (teacher() && !profile.teacherName)
            throw new Error('Akun guru belum terhubung dengan data guru yang valid.');
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
            badge.textContent = teacher() ? `Guru · ${profile.teacherName}` : (profile.role === 'koordinator' ? 'Koordinator' : 'Admin');
        ['rapor', 'kelompok', 'absensi', 'infografik', 'identitas', 'pengaturan', 'maintenance'].forEach(page => {
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
        profile = null;
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => deny(error), { once: true });
        else
            deny(error);
    });
    return { ready, full, teacher, canPage, scope, applyUI, get profile() { return profile; } };
})();
