async function loadAccountSettings() {
    if (!AppAccess.full()) return;
    const select = document.getElementById('accountTeacher');
    const previous = select.value;
    select.replaceChildren(new Option('Pilih guru untuk akun ini', ''));
    (await getTeachers()).forEach(teacher => select.add(new Option(teacher.nama, teacher.id)));
    select.value = previous;
    const { data, error } = await supabase.rpc('list_school_accounts');
    const body = document.getElementById('accountRows');
    if (error) { document.getElementById('accountFeedback').textContent = 'Daftar akses belum dapat dimuat. Pastikan migrasi role sudah diterapkan.'; return; }
    body.innerHTML = data.map(row => `<tr><td>${escapeHtml(row.email)}</td><td>${escapeHtml(row.role)}</td><td>${escapeHtml(row.teacher_name || 'Semua data')}</td></tr>`).join('');
}
document.addEventListener('panelready', () => {
    const form = document.getElementById('accountForm');
    document.getElementById('accountRoleSelect').addEventListener('change', event => {
        const guru = event.target.value === 'guru';
        document.getElementById('accountTeacher').disabled = !guru;
        document.getElementById('accountTeacher').required = guru;
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!AppAccess.full()) return;
        const button = document.getElementById('accountSave');
        const feedback = document.getElementById('accountFeedback');
        button.disabled = true;
        try {
            const { error } = await supabase.rpc('assign_school_account', {
                account_email: document.getElementById('accountEmail').value.trim(),
                account_role: document.getElementById('accountRoleSelect').value,
                linked_teacher: document.getElementById('accountTeacher').value || null
            });
            if (error) throw error;
            feedback.textContent = 'Akses disimpan. Akun yang diubah perlu masuk kembali untuk memperbarui panel.';
            await loadAccountSettings();
        } catch (error) { feedback.textContent = error.message || 'Gagal menyimpan akses akun.'; }
        finally { button.disabled = false; }
    });
});
