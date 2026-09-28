let gmTeacherAccountHints = [];
let gmExistingSchoolAccounts = [];
let gmAvailableTeachers = [];
async function loadAccountSettings() {
    if (!AppAccess.full())
        return;
    const feedback = document.getElementById('accountFeedback');
    const body = document.getElementById('accountRows');
    feedback.textContent = 'Memuat daftar akses...';
    body.replaceChildren();
    try {
        const select = document.getElementById('accountTeacher');
        const previous = select.value;
        const [teachers, accounts] = await Promise.all([
            getTeachers(), supabase.rpc('gm_list_account_link_status')
        ]);
        // Jika SQL status akun belum terpasang, tampilkan data lama dengan
        // pemberitahuan bahwa akun Auth tanpa peran belum termasuk di daftar.
        let accountResult = accounts;
        let completeDirectory = true;
        if (accounts.error && ['PGRST202','42883'].includes(accounts.error.code)) {
            accountResult = await supabase.rpc('list_school_accounts');
            completeDirectory = false;
        }
        if (accountResult.error) throw accountResult.error;
        const data = accountResult.data || [];
        document.getElementById('accountDirectoryHint').textContent = completeDirectory ?
            'Seluruh email yang sudah dibuat di Supabase Authentication terlihat di sini.' :
            'SQL 11 belum terpasang: akun Auth yang belum diberi peran mungkin belum muncul. Pasang SQL status tautan untuk menampilkan semuanya.';
        // Sumber email hanya akun yang SAMA dengan kartu pada tabel Akses Akun.
        // Hindari mengambil email lain dari master guru atau menebaknya dari nama.
        gmExistingSchoolAccounts = data;
        gmAvailableTeachers = teachers;
        gmTeacherAccountHints = data.flatMap(row => {
            if (!row.teacher_name || !row.email) return [];
            const linked = row.teacher_id != null
                ? teachers.filter(teacher => String(teacher.id) === String(row.teacher_id))
                : teachers.filter(teacher => String(teacher.nama || '').trim().toLocaleLowerCase('id') ===
                    String(row.teacher_name).trim().toLocaleLowerCase('id'));
            return linked.length === 1 ? [{ teacher_id: linked[0].id, email: row.email, role: row.role, source: 'kartu akun' }] : [];
        });
        // Sediakan email akun yang sudah muncul dalam kartu sebagai pilihan formulir.
        const options = document.getElementById('accountEmailOptions');
        options.replaceChildren();
        [...new Set(data.map(row => String(row.email || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'id')).forEach(email => options.append(new Option(email, email)));
        select.replaceChildren(new Option('Pilih guru untuk akun ini', ''));
        teachers.forEach(teacher => {
            const links = gmTeacherAccountHints.filter(item => String(item.teacher_id) === String(teacher.id));
            const emails = [...new Set(links.map(item => item.email))];
            const status = emails.length === 1 ? ` ✓ Tertaut · ${emails[0]}` :
                emails.length > 1 ? ` · ${emails.length} akun tertaut` : ' ○ Belum tertaut';
            const option = new Option(`${teacher.nama_lengkap || teacher.nama}${status}`, String(teacher.id));
            option.dataset.linked = emails.length ? 'true' : 'false';
            select.add(option);
        });
        select.value = previous;
        if (previous) gmSyncEmailFromTeacher(previous, false);
        const statusOf = row => row.link_status || (row.teacher_name ? 'linked' : row.role === 'admin' ? 'admin' : 'unlinked');
        const linkedCount = data.filter(row => statusOf(row) === 'linked').length;
        const unlinkedCount = data.filter(row => ['unlinked','unassigned'].includes(statusOf(row))).length;
        document.getElementById('accountLinkSummary').textContent = `${linkedCount} akun tertaut · ${unlinkedCount} perlu ditautkan`;

        body.innerHTML = data.map(row => {
            const status = statusOf(row);
            const badge = status === 'linked' ? '<span class="gm-link-badge is-linked">✓ Sudah tertaut</span>' :
                status === 'admin' ? '<span class="gm-link-badge is-admin">Admin · Semua data</span>' :
                status === 'unassigned' ? '<span class="gm-link-badge is-unlinked">○ Belum diberi peran</span>' :
                '<span class="gm-link-badge is-unlinked">○ Belum tertaut</span>';
            return `<tr data-link-status="${status}"><td><button type="button" class="account-email-pick" data-use-account="${escapeHtml(row.email)}" title="Gunakan email akun ini">${escapeHtml(row.email)}</button></td><td>${escapeHtml(row.role === 'belum_ditetapkan' ? 'Belum ditetapkan' : row.role)}</td><td>${badge}<div class="gm-account-scope">${escapeHtml(row.teacher_name || (row.role === 'admin' ? 'Seluruh data' : 'Pilih guru untuk akun ini'))}</div></td><td><button type="button" class="secondary-action" data-delete-account="${escapeHtml(row.email)}">Hapus akun</button></td></tr>`; }).join('');
        gmApplyAccountLinkFilter();
        feedback.textContent = data?.length ? '' : 'Belum ada akun dengan hak akses.';
        const { data: pending, error: pendingError } = await supabase.from('account_deletion_jobs').select('kind,target').eq('complete', false);
        if (!pendingError)
            body.insertAdjacentHTML('beforeend', (pending || []).map(job => `<tr><td>${escapeHtml(job.target)}</td><td colspan="2">Penghapusan tertunda</td><td><button type="button" class="secondary-action" data-delete-kind="${escapeHtml(job.kind)}" data-delete-target="${escapeHtml(job.target)}">Lanjutkan hapus</button></td></tr>`).join(''));
    }
    catch (error) {
        const detail = error.message || 'Kesalahan koneksi';
        const code = error.code ? ` (${error.code})` : '';
        const repair = /list_school_accounts|gm_list_account_link_status/i.test(detail) || ['PGRST202', '42883', '42501'].includes(error.code)
            ? ' Jalankan supabase/account-access-fix.sql melalui SQL Editor sebagai pemilik database. Jika masih ditolak, keluar dan masuk kembali sebagai admin/koordinator.'
            : '';
        feedback.textContent = `Daftar akses belum dapat dimuat${code}: ${detail}.${repair}`;
    }
}

function gmSyncEmailFromTeacher(teacherId, clearOld = true) {
    const input = document.getElementById('accountEmail');
    const hint = document.getElementById('accountEmailHint');
    if (clearOld) input.value = '';
    const matches = [...new Set(gmTeacherAccountHints.filter(row => String(row.teacher_id) === String(teacherId))
        .map(row => String(row.email || '').trim()).filter(Boolean))];
    if (matches.length === 1) {
        const keepCurrentEmail = !clearOld && String(input.value || '').trim();
        if (!keepCurrentEmail) input.value = matches[0];
        hint.textContent = keepCurrentEmail
            ? 'Data guru dipilih. Email akun yang sedang diedit tetap dipertahankan.'
            : '✓ Guru ini sudah tertaut ke akun ' + matches[0] + '.';
    } else if (matches.length > 1) {
        hint.textContent = 'Guru ini memiliki lebih dari satu jenis akun (misalnya Guru dan Koordinator). Pilih email akun yang ingin diubah dari tabel di bawah.';
    } else {
        hint.textContent = teacherId ? 'Belum ada email akun terhubung pada tabel. Gunakan email akun yang telah dibuat koordinator.' : ''; 
    }
}

function gmFindExistingAccountByEmail(email) {
    const key = String(email || '').trim().toLocaleLowerCase('id');
    if (!key) return null;
    return gmExistingSchoolAccounts.find(row => String(row.email || '').trim().toLocaleLowerCase('id') === key) || null;
}
function gmSyncRoleFromExistingAccount() {
    const email = document.getElementById('accountEmail')?.value || '';
    const existing = gmFindExistingAccountByEmail(email);
    const roleSelect = document.getElementById('accountRoleSelect');
    const hint = document.getElementById('accountEmailHint');
    if (!existing || !roleSelect) return existing;
    if (existing.role === 'koordinator') {
        roleSelect.value = 'koordinator';
        roleSelect.dispatchEvent(new Event('change'));
        if (hint) hint.textContent = 'Akun ini tetap berperan sebagai Koordinator. Pilih data guru untuk menautkan tugas mengajarnya.';
    } else if (existing.role === 'admin') {
        roleSelect.value = 'admin';
        roleSelect.dispatchEvent(new Event('change'));
        if (hint) hint.textContent = 'Akun Admin tidak ditautkan ke data guru.';
    }
    return existing;
}

function gmApplyAccountLinkFilter() {
    const value = document.getElementById('accountLinkFilter')?.value || '';
    document.querySelectorAll('#accountRows tr[data-link-status]').forEach(row => {
        row.hidden = Boolean(value) && row.dataset.linkStatus !== value;
    });
}
document.addEventListener('panelready', () => {
    document.getElementById('accountRows').addEventListener('click', async (event) => {
        const use = event.target.closest('[data-use-account]');
        if (use && AppAccess.full()) {
            const row = gmExistingSchoolAccounts.find(item => item.email === use.dataset.useAccount);
            if (!row) return;
            document.getElementById('accountEmail').value = row.email;
            document.getElementById('accountRoleSelect').value = ['guru','koordinator','admin'].includes(row.role) ? row.role : 'guru';
            const matches = gmAvailableTeachers.filter(t => row.teacher_id != null ? String(t.id)===String(row.teacher_id) : t.nama === row.teacher_name);
            document.getElementById('accountTeacher').value = matches.length === 1 ? String(matches[0].id) : '';
            document.getElementById('accountRoleSelect').dispatchEvent(new Event('change'));
            document.getElementById('accountEmailHint').textContent = row.role === 'koordinator'
                ? 'Akun Koordinator dipilih. Role Koordinator tetap dipertahankan; pilih data guru untuk menautkan tugas mengajarnya.'
                : 'Email dipilih dari kartu akun yang sudah ada.';
            document.getElementById('accountEmail').focus();
            return;
        }
        const button = event.target.closest('[data-delete-account], [data-delete-target]');
        if (!button || !AppAccess.full() || button.disabled)
            return;
        const target = button.dataset.deleteAccount || button.dataset.deleteTarget;
        const kind = button.dataset.deleteKind || 'account';
        if (!(await AdminNotice.confirm(`Hapus ${target}? Akun login di Supabase akan dihapus permanen. Jika target guru, data gurunya juga dihapus.`)))
            return;
        button.disabled = true;
        try {
            await deleteSchoolAccount(kind, target);
            AdminNotice.notify('Akun berhasil dihapus dari Supabase.', 'success');
        }
        catch (error) {
            AdminNotice.notify(error.message, 'error');
        }
        finally {
            await loadAccountSettings();
        }
    });
    document.getElementById('accountLinkFilter').addEventListener('change', gmApplyAccountLinkFilter);
    document.getElementById('accountTeacher').addEventListener('change', event => {
        const currentRole = document.getElementById('accountRoleSelect').value;
        const existing = gmFindExistingAccountByEmail(document.getElementById('accountEmail').value);
        const keepCoordinatorEmail = currentRole === 'koordinator' || existing?.role === 'koordinator';
        gmSyncEmailFromTeacher(event.target.value, !keepCoordinatorEmail);
        if (keepCoordinatorEmail && event.target.value)
            document.getElementById('accountEmailHint').textContent = 'Data guru dipilih untuk akun Koordinator ini. Email dan role Koordinator tetap dipertahankan.';
    });
    document.getElementById('accountEmail').addEventListener('change', gmSyncRoleFromExistingAccount);
    document.getElementById('accountEmail').addEventListener('blur', gmSyncRoleFromExistingAccount);
    const form = document.getElementById('accountForm');
    document.getElementById('accountRoleSelect').addEventListener('change', event => {
        const guru = ['guru', 'koordinator'].includes(event.target.value);
        document.getElementById('accountTeacher').disabled = !guru;
        document.getElementById('accountTeacher').required = event.target.value === 'guru';
        if (!guru) document.getElementById('accountEmailHint').textContent = 'Admin tidak membutuhkan tautan guru.';
        else if (event.target.value === 'koordinator' && !document.getElementById('accountTeacher').value)
            document.getElementById('accountEmailHint').textContent = 'Opsional: pilih data guru jika koordinator juga mengajar.';
        else if (document.getElementById('accountTeacher').value) gmSyncEmailFromTeacher(document.getElementById('accountTeacher').value, false);
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!AppAccess.full())
            return;
        const button = document.getElementById('accountSave');
        const feedback = document.getElementById('accountFeedback');
        button.disabled = true;
        try {
            const chosenEmail = document.getElementById('accountEmail').value.trim();
            const chosenTeacherId = document.getElementById('accountTeacher').value;
            const chosenTeacher = gmAvailableTeachers.find(row => String(row.id) === String(chosenTeacherId));
            const linked = gmFindExistingAccountByEmail(chosenEmail);
            const selectedRole = document.getElementById('accountRoleSelect').value;
            // Menautkan data guru ke akun Koordinator TIDAK boleh menurunkan role menjadi Guru.
            // Ini juga melindungi pengelola terakhir dari perubahan role yang tidak disengaja.
            const role = linked?.role === 'koordinator' && chosenTeacher ? 'koordinator' : selectedRole;
            if (role !== selectedRole) {
                document.getElementById('accountRoleSelect').value = role;
                document.getElementById('accountRoleSelect').dispatchEvent(new Event('change'));
            }
            const otherAccount = gmExistingSchoolAccounts.find(row =>
                row.email?.toLocaleLowerCase('id') !== chosenEmail.toLocaleLowerCase('id') &&
                chosenTeacher && ['guru','koordinator'].includes(role) &&
                (row.teacher_id != null ? String(row.teacher_id)===String(chosenTeacher.id) :
                    row.teacher_name && String(row.teacher_name).trim().toLocaleLowerCase('id')===String(chosenTeacher.nama).trim().toLocaleLowerCase('id')) &&
                row.role === role);
            if (otherAccount) throw new Error(`Data guru ini sudah tertaut ke akun ${role === 'koordinator' ? 'Koordinator' : 'Guru'} ${otherAccount.email}. Gunakan akun tersebut atau ubah tautannya terlebih dahulu.`);
            if (linked?.teacher_name && chosenTeacher &&
                linked.teacher_name.trim().toLocaleLowerCase('id') !== String(chosenTeacher.nama || '').trim().toLocaleLowerCase('id') &&
                ['guru','koordinator'].includes(role))
                throw new Error('Email ini sudah terhubung dengan guru lain pada kartu akun. Periksa data sebelum mengubah tautannya.');
            const { error } = await supabase.rpc('assign_school_account', {
                account_email: chosenEmail,
                account_role: role,
                linked_teacher: chosenTeacherId || null
            });
            if (error)
                throw error;
            feedback.textContent = role === 'koordinator' && chosenTeacher ? 'Koordinator berhasil ditautkan ke data guru tanpa mengubah hak akses Koordinator. Silakan masuk kembali untuk memperbarui panel.' : 'Akses disimpan. Akun yang diubah perlu masuk kembali untuk memperbarui panel.';
            await loadAccountSettings();
        }
        catch (error) {
            feedback.textContent = error.message || 'Gagal menyimpan akses akun.';
        }
        finally {
            button.disabled = false;
        }
    });
});
