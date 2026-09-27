window.AdminNotice = (() => {
    let tray, dialog, pending;
    const kindOf = text => /gagal|kesalahan|tidak ditemukan|tidak valid|ditolak|belum dapat|tidak sama|wajib|harus/i.test(text) ? 'error' : /berhasil|disimpan|diakhiri|dikirim/i.test(text) ? 'success' : 'info';
    function notify(text, kind = kindOf(String(text))) {
        if (!tray) {
            tray = document.createElement('div');
            tray.className = 'admin-toasts';
            document.body.append(tray);
        }
        const item = document.createElement('div');
        item.className = `admin-toast notice-${kind}`;
        item.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        const icon = document.createElement('span');
        icon.className = 'notice-icon';
        icon.textContent = kind === 'success' ? '\u2713' : kind === 'error' ? '!' : 'i';
        icon.setAttribute('aria-hidden', 'true');
        const body = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = kind === 'success' ? 'Berhasil' : kind === 'error' ? 'Perlu diperiksa' : 'Informasi';
        const content = document.createElement('p');
        content.textContent = text;
        body.append(title, content);
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '\u00d7';
        close.setAttribute('aria-label', 'Tutup notifikasi');
        close.onclick = () => dismiss();
        item.append(icon, body, close);
        tray.append(item);
        while (tray.children.length > 3)
            tray.firstElementChild.remove();
        let timer, leaving = false;
        function dismiss() { if (leaving)
            return; leaving = true; clearTimeout(timer); item.className += ' notice-leaving'; setTimeout(() => item.remove(), 250); }
        const schedule = () => { clearTimeout(timer); if (!leaving)
            timer = setTimeout(dismiss, kind === 'error' ? 4500 : 2800); };
        schedule();
        item.addEventListener('mouseenter', () => clearTimeout(timer));
        item.addEventListener('mouseleave', schedule);
        item.addEventListener('focusin', () => clearTimeout(timer));
        item.addEventListener('focusout', schedule);
    }
    function confirmAction(message) {
        if (pending)
            return Promise.resolve(false);
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.className = 'admin-confirm';
            dialog.setAttribute('aria-labelledby', 'noticeConfirmTitle');
            dialog.setAttribute('aria-describedby', 'noticeConfirmText');
            dialog.innerHTML = '<div class="confirm-emblem" aria-hidden="true">?</div><h2 id="noticeConfirmTitle">Konfirmasi tindakan</h2><p id="noticeConfirmText"></p><div class="confirm-actions"><button type="button" data-cancel class="secondary-action">Batal</button><button type="button" data-accept class="primary-action">Ya, lanjutkan</button></div>';
            document.body.append(dialog);
            dialog.querySelector('[data-cancel]').onclick = () => finish(false);
            dialog.querySelector('[data-accept]').onclick = () => finish(true);
            dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
        }
        const previous = document.activeElement;
        return new Promise(resolve => {
            pending = { resolve, previous };
            dialog.querySelector('#noticeConfirmText').textContent = message;
            dialog.showModal();
            dialog.querySelector('[data-cancel]').focus();
        });
    }
    function finish(value) { const request = pending; if (!request)
        return; pending = null; dialog.close(); if (request.previous?.isConnected)
        request.previous.focus(); request.resolve(value); }
    document.addEventListener('panelready', () => {
        document.querySelectorAll('[id$="Feedback"]').forEach(node => {
            let previous = node.textContent;
            new MutationObserver(() => {
                const text = node.textContent.trim();
                if (!text || text === previous)
                    return;
                previous = text;
                const kind = node.dataset.feedbackError === 'true' || node.classList.contains('is-error') ? 'error' : kindOf(text);
                node.dataset.notice = kind;
                if (kind !== 'info' || /^(Pilih|Periksa|Konfirmasi|Guru ini|Daftar siswa .*berubah)/i.test(text))
                    notify(text, kind);
            }).observe(node, { childList: true, characterData: true, subtree: true });
        });
    });
    return { notify, confirm: confirmAction };
})();
