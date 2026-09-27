window.AccountProfile = (() => {
    const el = id => document.getElementById(id);
    const message = (text, error = false) => { el('profileFeedback').dataset.feedbackError = String(error); el('profileFeedback').textContent = text; };
    async function open() {
        try {
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user)
                throw error || new Error('Silakan masuk kembali.');
            el('profileEmail').value = data.user.email || '';
            el('profileName').value = data.user.user_metadata?.full_name || '';
            message(data.user.user_metadata?.temporary_password ? 'Anda memakai password sementara. Silakan ubah password di bawah.' : 'Kelola profil dan password akun Anda.');
        }
        catch (error) {
            message(error.message, true);
        }
    }
    async function submit(form, action) {
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            await action();
        }
        catch (error) {
            message(error.message || 'Gagal memperbarui akun.', true);
        }
        finally {
            button.disabled = false;
        }
    }
    document.addEventListener('panelready', () => {
        el('profileForm').addEventListener('submit', event => {
            event.preventDefault();
            return submit(event.target, async () => {
                const { error } = await supabase.auth.updateUser({ data: { full_name: el('profileName').value.trim() } });
                if (error)
                    throw error;
                message('Nama profil disimpan.');
            });
        });
        el('passwordForm').addEventListener('submit', event => {
            event.preventDefault();
            return submit(event.target, async () => {
                const password = el('profilePassword').value;
                if (password.length < 10 || password.length > 128)
                    throw new Error('Password harus 10 sampai 128 karakter.');
                if (password !== el('profileConfirm').value)
                    throw new Error('Konfirmasi password tidak sama.');
                const nonce = el('profileNonce').value.trim();
                const { error } = await supabase.auth.updateUser({ password, ...(nonce ? { nonce } : {}), data: { temporary_password: false } });
                if (error)
                    throw error;
                event.target.reset();
                message('Password berhasil diubah. Gunakan password baru saat masuk berikutnya.');
            });
        });
        el('profileReauthenticate').addEventListener('click', async (event) => {
            event.target.disabled = true;
            try {
                const { error } = await supabase.auth.reauthenticate();
                if (error)
                    throw error;
                message('Kode verifikasi dikirim ke kontak akun Anda. Masukkan kode, lalu ubah password.');
            }
            catch (error) {
                message(error.message, true);
            }
            finally {
                event.target.disabled = false;
            }
        });
    });
    return { open };
})();
