window.ProgressForm = (() => {
    const esc = value => escapeHtml(String(value ?? ''));
    function markup(value, subject, prefix = 'progress') {
        const v = ReportCore.legacy(value);
        const select = (field, label, options) => `<label class="field-label">${label}<select data-field="${field}" id="${prefix}-${field}" required><option value="">Pilih</option>${options.map(option => { const [key, text] = Array.isArray(option) ? option : [option, option]; return `<option value="${esc(key)}" ${String(v[field]) === String(key) ? 'selected' : ''}>${esc(text)}</option>`; }).join('')}</select></label>`;
        const input = (field, label, max) => `<label class="field-label">${label}<input data-field="${field}" value="${esc(v[field])}" type="number" min="1" max="${max}" step="1" required></label>`;
        let html = '';
        if (subject === 'tahsin') {
            html = select('tahsin_progress_type', 'Jenis capaian', ReportCore.types);
            if (!v.tahsin_progress_type && v.tahsin_book)
                html += `<p class="assessment-empty">Capaian lama: ${esc(v.tahsin_book)}, halaman ${esc(v.tahsin_page)}. Pilih padanan yang benar untuk verifikasi.</p>`;
            switch (v.tahsin_progress_type) {
                case 'BUKU':
                    html += select('tahsin_book_number', 'Buku', [1, 2, 3]) + select('tahsin_page', 'Halaman', ReportCore.reference.books.filter(r => r.book === Number(v.tahsin_book_number)).map(r => r.page)) + `<p class="progress-material">${esc(ReportCore.material(v.tahsin_book_number, v.tahsin_page) || 'Pilih buku dan halaman untuk melihat materi.')}</p>`;
                    break;
                case 'JILID':
                    html += select('tahsin_jilid', 'Materi Jilid', [['JUZ 27', 'Juz 27'], ['4', 'Jilid 4 — Bacaan dengung ikhfa']]);
                    break;
                case "AL-QUR'AN":
                    html += select('tahsin_surah_number', 'Surat', QURAN_SURAHS.map(s => [s.number, s.number + '. ' + ReportCore.surahName(s.number)])) + select('tahsin_ayah', 'Ayat terakhir', Array.from({ length: QURAN_SURAHS.find(s => s.number === Number(v.tahsin_surah_number))?.ayahs || 0 }, (_, i) => i + 1));
                    break;
            }
            if (["AL-QUR'AN", 'GHARIB', 'TAJWID', 'FINISHING'].includes(v.tahsin_progress_type)) {
                html += '<p class="assessment-help">Progres materi Gharib berbeda dengan nilai Gharib. Nilai angka Gharib tetap hanya untuk Finishing.</p>';
                html += `<label class="field-label">Juz terakhir yang diselesaikan<input data-field="tahsin_juz_last" type="number" min="1" max="30" value="${esc(v.tahsin_juz_last)}" placeholder="Isi jika sudah diketahui"></label>`;
                if (["AL-QUR'AN",'GHARIB','FINISHING'].includes(v.tahsin_progress_type))
                    html += `<label class="field-label">Halaman materi Gharib terakhir<input data-field="tahsin_gharib_page" type="number" min="1" max="60" value="${esc(v.tahsin_gharib_page)}" placeholder="Isi jika sudah dipelajari"></label>`;
                if (v.tahsin_progress_type === 'TAJWID')
                    html += select('tahsin_tajwid_target_done', 'Materi Tajwid tuntas?', [['false', 'Belum'], ['true', 'Tuntas']]);
            }
        }
        else {
            html = select('tahfidz_progress_type', 'Jenis capaian', [['SURAT', 'Surat dan ayat'], ['REVIEW', 'Review persiapan tes juz'], ['TES', 'Tes juz']]) + select('tahfidz_juz', 'Juz', Array.from({ length: 30 }, (_, i) => 30 - i));
            if ((v.tahfidz_progress_type || 'SURAT') === 'SURAT')
                html += input('tahfidz_ayah_start', 'Ayat awal', QURAN_SURAHS.find(s => s.number === Number(v.tahfidz_surah))?.ayahs || 286);
        }
        return html;
    }
    function changed(draft, field) { if (field === 'tahfidz_juz') {
        draft.tahfidz_surah = '';
        draft.tahfidz_ayah = '';
        draft.tahfidz_ayah_start = '1';
    } if (field === 'tahsin_surah_number')
        draft.tahsin_ayah = ''; if (field === 'tahsin_book_number')
        draft.tahsin_page = ''; return ['tahsin_progress_type', 'tahsin_book_number', 'tahsin_page', 'tahsin_surah_number', 'tahfidz_progress_type', 'tahfidz_juz'].includes(field); }
    return { markup, changed };
})();
