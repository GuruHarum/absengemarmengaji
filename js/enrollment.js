window.TeacherEnrollment = (() => {
    const el = id => document.getElementById(id);
    const message = (text, error = false) => { el('enrollmentFeedback').dataset.feedbackError = String(error); el('enrollmentFeedback').textContent = text; };
    let busy = false;
    const emailFromName = name => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    function previewEmail() {
        const name = el('enrollmentTeacher').value ? el('enrollmentTeacher').selectedOptions[0]?.textContent : el('enrollmentName').value;
        const local = emailFromName(name);
        el('enrollmentEmail').value = local ? `${local}@harum.com` : '';
    }
    async function open() {
        if (!AppAccess.full() || busy)
            return;
        el('teacherEnrollment').hidden = false;
        try {
            const previous = el('enrollmentTeacher').value;
            const teachers = await getTeachers();
            el('enrollmentTeacher').replaceChildren(new Option('Buat data guru baru', ''));
            teachers.forEach(row => el('enrollmentTeacher').add(new Option(row.nama, row.id)));
            el('enrollmentTeacher').value = previous;
            previewEmail();
        }
        catch (error) {
            message(error.message, true);
        }
    }
    ((callback) => window.GMPanel ? GMPanel.onReady(callback) : document.addEventListener('panelready', callback))( () => {
        el('enrollmentName').addEventListener('input', previewEmail);
        el('enrollmentTeacher').addEventListener('change', () => {
            const existing = Boolean(el('enrollmentTeacher').value);
            ['enrollmentName', 'enrollmentFullName', 'enrollmentAttendance'].forEach(id => { el(id).disabled = existing; });
            el('enrollmentName').required = !existing;
            el('enrollmentFullName').required = !existing;
            previewEmail();
        });
        el('enrollmentForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            if (busy || !AppAccess.full() || !event.target.reportValidity())
                return;
            busy = true;
            el('enrollmentFields').disabled = true;
            message('Membuat akun guru...');
            try {
                const { data, error } = await supabase.functions.invoke('create-teacher-account', { body: {
                        email: el('enrollmentEmail').value.trim(),
                        teacher_id: el('enrollmentTeacher').value || null, name: el('enrollmentName').value.trim(),
                        full_name: el('enrollmentFullName').value.trim(), attendance_enabled: el('enrollmentAttendance').value === 'true'
                    } });
                if (error) {
                    let detail;
                    try {
                        detail = await error.context?.json();
                    }
                    catch (_) { }
                    throw new Error(detail?.error || 'Akun belum berhasil dibuat. Pastikan fungsi create-teacher-account sudah di-deploy, lalu periksa koneksi.');
                }
                if (!data?.ok)
                    throw new Error(data?.error || 'Konfirmasi pembuatan akun tidak lengkap.');
                message(`Data dan akun guru berhasil dibuat. Login: ${data.email || el('enrollmentEmail').value}. Password awal: 1-0. Guru wajib menggantinya setelah masuk.`);
                await fetchTeachers();
                renderManageTable();
            }
            catch (error) {
                message(error.message, true);
            }
            finally {
                busy = false;
                el('enrollmentFields').disabled = false;
            }
        });
    });
    return { open };
})();
