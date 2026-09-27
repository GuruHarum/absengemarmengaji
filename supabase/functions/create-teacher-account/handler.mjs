// Service credentials stay in the Edge Function, never in browser assets.
export function createHandler(admin) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    return async request => {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (request.method !== 'POST') return reply(405, { error: 'Metode tidak didukung' });
        try {
            const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
            if (!token) return reply(401, { error: 'Login diperlukan' });
            const { data: auth, error: authError } = await admin.auth.getUser(token);
            if (authError || !auth.user) return reply(401, { error: 'Sesi tidak valid. Masuk kembali.' });
            const { data: role, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle();
            if (roleError || !['admin','koordinator'].includes(role?.role)) return reply(403, { error: 'Hanya koordinator/admin dapat membuat akun guru' });
            const input = await request.json();
            const email = typeof input.email === 'string' ? input.email.trim() : '';
            const password = input.password;
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 10 || password.length > 128) return reply(400, { error: 'Email valid dan password 10–128 karakter diperlukan' });
            if (input.teacher_id != null && (typeof input.teacher_id !== 'string' || input.teacher_id.length > 80)) return reply(400, { error: 'Pilihan guru tidak valid' });
            if (!input.teacher_id && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || typeof input.full_name !== 'string' || !input.full_name.trim() || input.full_name.length > 160)) return reply(400, { error: 'Nama guru dan nama lengkap wajib diisi' });
            const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
                user_metadata: { full_name: input.full_name || '', temporary_password: true } });
            if (createError || !created.user) return reply(400, { error: 'Akun tidak dapat dibuat. Periksa kebijakan password atau apakah email sudah terdaftar. Akun yang sudah ada dipasangkan melalui Akses Akun.' });
            let provision;
            try {
                provision = await admin.rpc('provision_teacher_account', { actor_id: auth.user.id, account_id: created.user.id,
                    linked_teacher: input.teacher_id || null, teacher_label: input.name || null, full_label: input.full_name || null,
                    show_attendance: input.attendance_enabled !== false });
            } catch (_) { provision = { error: { message: 'Konfirmasi penyimpanan terputus' } }; }
            if (provision.error) {
                // A network error may occur after DB commit. Never delete a provisioned account.
                const { data: mapped, error: checkError } = await admin.from('user_roles').select('teacher_id').eq('user_id', created.user.id).maybeSingle();
                if (mapped) return reply(200, { ok: true });
                if (checkError) return reply(503, { error: 'Status pembuatan akun belum dapat dipastikan. Periksa Authentication dan Akses Akun sebelum mencoba kembali.' });
                const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
                if (cleanupError) return reply(503, { error: 'Akun Authentication dibuat tetapi belum memiliki akses. Hubungi pengelola untuk pemetaan akun melalui Akses Akun.' });
                return reply(400, { error: provision.error.message || 'Pemetaan guru gagal; akun baru dibatalkan.' });
            }
            return reply(200, { ok: true });
        } catch (_) { return reply(500, { error: 'Permintaan belum dapat diselesaikan. Periksa status akun sebelum mencoba kembali.' }); }
    };
}
