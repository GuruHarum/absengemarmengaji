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
        let isLoginTransition = document.documentElement.classList.contains('gm-login-transition');
        try {
            // The dashboard's early inline bootstrap consumes the sessionStorage flag
            // after adding this class. Check both signals so that bootstrap order
            // cannot accidentally disable the first-login retry window.
            isLoginTransition = isLoginTransition || sessionStorage.getItem('gm_login_transition') === '1';
        } catch (_) {}
        const attempts = isLoginTransition ? 24 : 1;
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
        document.body.className = 'access-denied-page';
        const style = document.createElement('style');
        style.textContent = `
            body.access-denied-page {
                margin: 0; min-height: 100vh; min-height: 100svh; display: block;
                padding: 0; overflow-x: hidden; color: #f6f1e5;
                font-family: 'Poppins', sans-serif;
                background: var(--theme-pattern, none), radial-gradient(ellipse at 50% 35%, #173d36, #071c1a 85%);
            }
            .access-denied-layout {
                box-sizing: border-box; width: min(980px, 100%); min-height: 100vh; min-height: 100svh;
                margin: 0 auto; padding: 30px 36px 22px; display: flex; flex-direction: column;
            }
            .access-denied-brand {
                display: flex; align-items: center; gap: 13px; padding-bottom: 22px;
                border-bottom: 1px solid #d1b58124;
            }
            .access-denied-mark {
                width: 42px; height: 42px; display: grid; place-items: center; flex-shrink: 0;
                border: 1px solid #d1b58180; border-radius: 14px; color: #e4c995; font-size: 23px;
                background: #d1b5810c;
            }
            .access-denied-brand strong { display: block; font-size: 15px; font-weight: 600; letter-spacing: .01em; }
            .access-denied-brand p { margin: 4px 0 0; font-size: 10px; color: #b2c8b8; }
            .access-denied-main { flex: 1; display: grid; place-items: center; padding: 34px 0; }
            .access-denied-card {
                box-sizing: border-box; width: min(520px, 100%); padding: 38px 40px 34px; text-align: center;
                border: 1px solid #d1b58150; border-radius: 100px 100px 24px 24px;
                background: linear-gradient(155deg, #ffffff0b, #d1b58106); box-shadow: 0 28px 80px #00000018;
            }
            .access-denied-emblem { width: 92px; height: 92px; margin: 0 auto 24px; display: grid; place-items: center;
                color: #e4c995; border: 1px solid #d1b58165; border-radius: 50%;
                box-shadow: 0 0 0 8px #d1b5810b, inset 0 0 28px #d1b5810b; }
            .access-denied-emblem svg { width: 48px; height: 48px; }
            .access-denied-kicker { margin: 0 0 10px; font-size: 9px; letter-spacing: .2em; color: #d1b581; }
            .access-denied-card h1 { margin: 0 0 14px; font-family: Georgia, serif; font-size: clamp(29px, 5vw, 38px);
                line-height: 1.2; font-weight: 400; letter-spacing: -.025em; color: #f5eedc; }
            .access-denied-description { margin: 0 auto; max-width: 390px; font-size: 12px; line-height: 1.9; color: #b9ccbc; overflow-wrap: anywhere; }
            .access-denied-note { display: flex; gap: 12px; align-items: flex-start; text-align: left; margin: 25px 0 22px;
                padding: 16px; border: 1px solid #d1b58124; border-radius: 14px; background: #d1b58108; }
            .access-denied-note-icon { flex: 0 0 30px; width: 30px; height: 30px; display: grid; place-items: center;
                border-radius: 50%; background: #d1b58118; color: #e4c995; font-size: 15px; }
            .access-denied-note strong { display: block; margin: 0 0 4px; font-size: 11px; color: #e4c995; font-weight: 500; }
            .access-denied-note span { display: block; font-size: 10px; line-height: 1.75; color: #b9ccbc; }
            .access-denied-login { display: flex; justify-content: center; align-items: center; gap: 10px; width: 100%;
                box-sizing: border-box; min-height: 48px; padding: 12px 18px; border-radius: 12px;
                background: linear-gradient(110deg, #d1b581, #e6d3a5); color: #102c25; text-decoration: none;
                font-size: 12px; font-weight: 600; transition: transform .18s ease, filter .18s ease; }
            .access-denied-login:hover { transform: translateY(-1px); filter: brightness(1.04); }
            .access-denied-footer { padding-top: 16px; border-top: 1px solid #d1b58124; display: flex; justify-content: space-between;
                gap: 12px; color: #9eb5a4; font-size: 9px; }
            @media (max-width: 600px) {
                .access-denied-layout { padding: 20px 18px 16px; }
                .access-denied-brand { padding-bottom: 18px; }
                .access-denied-card { padding: 32px 22px 24px; border-radius: 64px 64px 20px 20px; }
                .access-denied-main { padding: 24px 0; }
                .access-denied-footer { flex-direction: column; text-align: center; gap: 5px; }
            }
            @media (prefers-reduced-motion: reduce) { .access-denied-login { transition: none; } }
        `;
        const layout = document.createElement('main');
        layout.className = 'access-denied-layout';
        layout.innerHTML = `
            <header class="access-denied-brand">
                <span class="access-denied-mark" aria-hidden="true">✦</span>
                <div><strong>Gemar Mengaji</strong><p>SDIT Harapan Umat Karawang</p></div>
            </header>
            <section class="access-denied-main">
                <div class="access-denied-card" role="alert">
                    <div class="access-denied-emblem" aria-hidden="true">
                        <svg viewBox="0 0 48 48" fill="none"><path d="M24 4 40 10v12c0 10-6.8 17-16 22C14.8 39 8 32 8 22V10L24 4Z" stroke="currentColor" stroke-width="1.5"/><rect x="17" y="21" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M20 21v-4a4 4 0 1 1 8 0v4" stroke="currentColor" stroke-width="1.8"/><circle cx="24" cy="26.5" r="1.5" fill="currentColor"/><path d="M24 28v2" stroke="currentColor" stroke-width="1.5"/></svg>
                    </div>
                    <p class="access-denied-kicker">AKSES AKUN</p>
                    <h1>Akses Diperlukan</h1>
                    <p class="access-denied-description"></p>
                    <div class="access-denied-note">
                        <span class="access-denied-note-icon" aria-hidden="true">i</span>
                        <div><strong>Kenapa halaman ini muncul?</strong><span>Pastikan Anda masuk menggunakan akun yang terdaftar. Jika akun sudah benar tetapi akses tetap ditolak, hubungi koordinator Gemar Mengaji.</span></div>
                    </div>
                    <a class="access-denied-login" href="login.html"><span aria-hidden="true">←</span> Kembali ke Halaman Login</a>
                </div>
            </section>
            <footer class="access-denied-footer"><span>© 2026 SDIT Harapan Umat</span><span>Gemar Mengaji · Akses Aman</span></footer>
        `;
        layout.querySelector('.access-denied-description').textContent = error?.message || 'Sesi atau hak akses akun belum tersedia. Silakan masuk kembali.';
        document.head.appendChild(style);
        document.body.replaceChildren(layout);
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
