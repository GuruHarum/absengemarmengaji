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
        const teachers = await getTeachers();
        select.replaceChildren(new Option('Pilih guru untuk akun ini', ''));
        teachers.forEach(teacher => select.add(new Option(teacher.nama, teacher.id)));
        select.value = previous;
        const { data, error } = await supabase.rpc('list_school_accounts');
        if (error)
            throw error;
        body.innerHTML = (data || []).map(row => `<tr><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.teacher_name || 'Semua data')}</td><td><button type="button" class="secondary-action" data-delete-account="${escapeHtml(row.email)}">Hapus akun</button></td></tr>`).join('');
        feedback.textContent = data?.length ? '' : 'Belum ada akun dengan hak akses.';
        const { data: pending, error: pendingError } = await supabase.from('account_deletion_jobs').select('kind,target').eq('complete', false);
        if (!pendingError)
            body.insertAdjacentHTML('beforeend', (pending || []).map(job => `<tr><td>${escapeHtml(job.target)}</td><td colspan="2">Penghapusan tertunda</td><td><button type="button" class="secondary-action" data-delete-kind="${escapeHtml(job.kind)}" data-delete-target="${escapeHtml(job.target)}">Lanjutkan hapus</button></td></tr>`).join(''));
    }
    catch (error) {
        const detail = error.message || 'Kesalahan koneksi';
        const code = error.code ? ` (${error.code})` : '';
        const repair = /list_school_accounts/i.test(detail) || ['PGRST202', '42883', '42501'].includes(error.code)
            ? ' Jalankan supabase/account-access-fix.sql melalui SQL Editor sebagai pemilik database. Jika masih ditolak, keluar dan masuk kembali sebagai admin/koordinator.'
            : '';
        feedback.textContent = `Daftar akses belum dapat dimuat${code}: ${detail}.${repair}`;
    }
}
document.addEventListener('panelready', () => {
    document.getElementById('accountRows').addEventListener('click', async (event) => {
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
    const form = document.getElementById('accountForm');
    document.getElementById('accountRoleSelect').addEventListener('change', event => {
        const guru = ['guru', 'koordinator'].includes(event.target.value);
        document.getElementById('accountTeacher').disabled = !guru;
        document.getElementById('accountTeacher').required = event.target.value === 'guru';
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!AppAccess.full())
            return;
        const button = document.getElementById('accountSave');
        const feedback = document.getElementById('accountFeedback');
        button.disabled = true;
        try {
            const { error } = await supabase.rpc('assign_school_account', {
                account_email: document.getElementById('accountEmail').value.trim(),
                account_role: document.getElementById('accountRoleSelect').value,
                linked_teacher: document.getElementById('accountTeacher').value || null
            });
            if (error)
                throw error;
            feedback.textContent = 'Akses disimpan. Akun yang diubah perlu masuk kembali untuk memperbarui panel.';
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
